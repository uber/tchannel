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
	"net"
	"os"
	"time"

	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/hyperbahn"
	"github.com/uber/tchannel/golang/raw"
	"golang.org/x/net/context"
)

func main() {
	tchan, err := tchannel.NewChannel("go-echo-server", nil)
	if err != nil {
		log.Fatalf("Failed to create channel: %v", err)
	}

	listenIP, err := tchannel.ListenIP()
	if err != nil {
		log.Fatalf("Failed to get IP to listen on: %v", err)
	}

	l, err := net.Listen("tcp", listenIP.String()+":61543")
	if err != nil {
		log.Fatalf("Could not listen: %v", err)
	}
	log.Printf("Listening on %v", l.Addr())

	tchan.Register(raw.Wrap(handler{}), "echo")
	tchan.Serve(l)

	if len(os.Args[1:]) == 0 {
		log.Fatalf("You must provide Hyperbahn nodes as arguments")
	}

	// advertise service with Hyperbahn.
	config := hyperbahn.Configuration{InitialNodes: os.Args[1:]}
	client := hyperbahn.NewClient(tchan, config, &hyperbahn.ClientOptions{
		Handler: eventHandler{},
		Timeout: time.Second,
	})
	if err := client.Advertise(); err != nil {
		log.Fatalf("Advertise failed: %v", err)
	}

	// Server will keep running till Ctrl-C.
	select {}
}

type eventHandler struct{}

func (eventHandler) On(event hyperbahn.Event) {
	fmt.Printf("On(%v)\n", event)
}

func (eventHandler) OnError(err error) {
	fmt.Printf("OnError(%v)\n", err)
}

type handler struct{}

func (handler) OnError(ctx context.Context, err error) {
	log.Fatalf("OnError: %v", err)
}

func (handler) Handle(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	return &raw.Res{
		Arg2: args.Arg2,
		Arg3: args.Arg3,
	}, nil
}
