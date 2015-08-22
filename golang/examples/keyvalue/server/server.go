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

package main

import (
	"fmt"
	"log"
	"os"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/examples/keyvalue/gen-go/keyvalue"
	"github.com/uber/tchannel/golang/hyperbahn"
	"github.com/uber/tchannel/golang/thrift"
)

func main() {
	// Create a TChannel and register the Thrift handlers.
	ch, err := tchannel.NewChannel("keyvalue", nil)
	if err != nil {
		log.Fatalf("Failed to create tchannel: %v", err)
	}

	// Register both the KeyValue and Admin services.
	// We can register multiple Thrift services on a single Hyperbahn service.
	h := newKVHandler()
	server := thrift.NewServer(ch)
	server.Register(keyvalue.NewTChanKeyValueServer(h))
	server.Register(keyvalue.NewTChanAdminServer(h))

	// Listen for connections on the external interface so we can receive connections.
	ip, err := tchannel.ListenIP()
	if err != nil {
		log.Fatalf("Failed to find IP to Listen on: %v", err)
	}
	// We use port 0 which asks the OS to assign any available port.
	// Static port allocations are not necessary for services on Hyperbahn.
	ch.ListenAndServe(fmt.Sprintf("%v:%v", ip, 0))

	// Advertising registers this service instance with Hyperbahn so
	// that Hyperbahn can route requests for "keyvalue" to us.
	config := hyperbahn.Configuration{InitialNodes: os.Args[1:]}
	if len(config.InitialNodes) == 0 {
		log.Fatalf("No Autobahn nodes to advertise with")
	}
	client, err := hyperbahn.NewClient(ch, config, nil)
	if err != nil {
		log.Fatalf("hyperbahn.NewClient failed: %v", err)
	}
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
func newKVHandler() *kvHandler {
	return &kvHandler{vals: make(map[string]string)}
}

// Get returns the value stored for the given key.
func (h *kvHandler) Get(ctx thrift.Context, key string) (string, error) {
	if err := isValidKey(key); err != nil {
		return "", err
	}

	h.mut.RLock()
	defer h.mut.RUnlock()

	if val, ok := h.vals[key]; ok {
		return val, nil
	}

	return "", &keyvalue.KeyNotFound{Key: key}
}

// Set sets the value for a given key.
func (h *kvHandler) Set(ctx thrift.Context, key, value string) error {
	if err := isValidKey(key); err != nil {
		return err
	}

	h.mut.Lock()
	defer h.mut.Unlock()

	h.vals[key] = value
	// Example of how to use response headers. Normally, these values should be passed via result structs.
	ctx.SetResponseHeaders(map[string]string{"count": fmt.Sprint(len(h.vals))})
	return nil
}

// HealthCheck return the health status of this process.
func (h *kvHandler) HealthCheck(ctx thrift.Context) (string, error) {
	return "OK", nil
}

// ClearAll clears all the keys.
func (h *kvHandler) ClearAll(ctx thrift.Context) error {
	if !isAdmin(ctx) {
		return &keyvalue.NotAuthorized{}
	}

	h.mut.Lock()
	defer h.mut.Unlock()

	h.vals = make(map[string]string)
	return nil
}

func isValidKey(key string) error {
	r, _ := utf8.DecodeRuneInString(key)
	if !unicode.IsLetter(r) {
		return &keyvalue.InvalidKey{}
	}
	return nil
}

func isAdmin(ctx thrift.Context) bool {
	return ctx.Headers()["user"] == "admin"
}
