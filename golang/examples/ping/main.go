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
	"time"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

var log = tchannel.SimpleLogger

type Headers map[string]string

type Ping struct {
	Message string `json:"message"`
}

type Pong Ping

func pingHandler(ctx context.Context, call *tchannel.InboundCall) {
	var headers Headers

	var inArg2 []byte
	if err := tchannel.NewArgReader(call.Arg2Reader()).ReadBytes(&inArg2); err != nil {
		log.Errorf("Could not read headers from client: %v", err)
		return
	}

	var inArg3 []byte
	if err := tchannel.NewArgReader(call.Arg2Reader()).ReadBytes(&inArg3); err != nil {
		log.Errorf("Could not read body from client: %v", err)
		return
	}

	if err := tchannel.NewArgWriter(call.Response().Arg2Writer()).WriteJSON(headers); err != nil {
		log.Errorf("Could not echo response headers to client: %v", err)
		return
	}

	pong := Pong{Message: fmt.Sprintf("ping %s", inArg3)}
	if err := tchannel.NewArgWriter(call.Response().Arg3Writer()).WriteJSON(pong); err != nil {
		log.Errorf("Could not write response body to client: %v", err)
		return
	}
}

func listenAndHandle(s *tchannel.Channel, hostPort string) {
	log.Infof("Service %s", hostPort)

	// If no error is returned, this blocks forever

	if err := s.ListenAndServe(hostPort); err != nil {
		log.Fatalf("Could not listen on %s: %v", hostPort, err)
	}
}

func main() {
	// Create a new TChannel for handling requests
	ch, err := tchannel.NewChannel("ping-server", nil)
	if err != nil {
		log.Fatalf("Could not create new channel: %v", err)
	}

	// Register a handler for the ping message on the PingService
	ch.Register(tchannel.HandlerFunc(pingHandler), "PingService", "ping")

	// Listen for incoming requests
	go listenAndHandle(ch, "127.0.0.1:10500")

	// Create a new TChannel for sending requests.
	client, err := tchannel.NewChannel("ping-client", nil)
	if err != nil {
		log.Fatalf("Could not create new client channel: %v", err)
	}

	// Make a call to ourselves, with a timeout of 10s
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	// Wait for the server to start before connecting
	time.Sleep(time.Millisecond * 100)

	call, err := client.BeginCall(ctx, "127.0.0.1:10500", "PingService", "ping", nil)
	if err != nil {
		log.Fatalf("Could not begin call to local ping service: %v", err)
	}

	if err := tchannel.NewArgWriter(call.Arg2Writer()).WriteJSON(Headers{}); err != nil {
		log.Fatalf("Could not write headers: %v", err)
	}

	if err := tchannel.NewArgWriter(call.Arg3Writer()).WriteJSON(Ping{"Hello World!"}); err != nil {
		log.Fatalf("Could not write ping: %v", err)
	}

	var responseHeaders Headers
	if err := tchannel.NewArgReader(call.Response().Arg2Reader()).ReadJSON(&responseHeaders); err != nil {
		log.Fatalf("Could not read response headers: %v", err)
	}

	var pong Pong
	if err := tchannel.NewArgReader(call.Response().Arg3Reader()).ReadJSON(&pong); err != nil {
		log.Fatalf("Could not read response pong: %v", err)
	}

	log.Infof("Received pong: %s", pong.Message)
}
