package main

// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

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
