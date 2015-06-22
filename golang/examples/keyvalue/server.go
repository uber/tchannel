package main

import (
	"fmt"
	"log"
	"os"
	"reflect"
	"sync"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples/keyvalue/gen-go/keyvalue"
	"github.com/uber/tchannel/golang/hyperbahn"
	"github.com/uber/tchannel/golang/thrift"
)

func main() {
	// Create a TChannel and listen for inbound connections.
	ch, err := tchannel.NewChannel("keyvalue", nil)
	if err != nil {
		log.Fatalf("Failed to create tchannel: %v", err)
	}
	ip, err := tchannel.ListenIP()
	if err != nil {
		log.Fatalf("Failed to find IP to Listen on: %v", err)
	}
	ch.ListenAndServe(ip.String() + ":12345")

	// Create the handler for KeyValue service,
	h := NewKVHandler()
	server := thrift.NewServer(ch)
	server.Register("KeyValue", reflect.TypeOf(h), keyvalue.NewKeyValueProcessor(h))

	config := hyperbahn.Configuration{InitialNodes: os.Args[1:]}
	if len(config.InitialNodes) == 0 {
		log.Fatalf("No Autobahn nodes to advertise with")
	}
	client := hyperbahn.NewClient(ch, config, nil)
	if err := client.Advertise(); err != nil {
		log.Fatalf("Hyperbahn advertise failed: %v", err)
	}

	// The service is now started up, run it till we receive a ctrl-c.
	log.Printf("KeyValue service has started on %v", ch.PeerInfo().HostPort)
	select {}
}

type kvHandler struct {
	mut  sync.RWMutex
	vals map[string]string
}

// NewKVHandler returns a new handler for the KeyValue service.
func NewKVHandler() keyvalue.KeyValue {
	return &kvHandler{vals: make(map[string]string)}
}

// Get returns the value stored for the given key.
func (h *kvHandler) Get(key string) (string, error) {
	h.mut.RLock()
	defer h.mut.RUnlock()

	if val, ok := h.vals[key]; ok {
		return val, nil
	}
	return "", fmt.Errorf("no value found for key: %q", key)
}

// Set sets the value for a given key.
func (h *kvHandler) Set(key, value string) error {
	fmt.Println("got a set", key, value)
	h.mut.Lock()
	defer h.mut.Unlock()

	h.vals[key] = value
	return nil
}
