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
	"flag"
	"time"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

var log = tchannel.SimpleLogger

func echo(ctx context.Context, call *tchannel.InboundCall) {
	var inArg2 tchannel.BytesInput
	if err := call.ReadArg2(&inArg2); err != nil {
		log.Errorf("could not start arg2: %v", err)
		return
	}

	log.Infof("Arg2: %s", inArg2)

	var inArg3 tchannel.BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		log.Errorf("could not start arg3: %v", err)
		return
	}

	log.Infof("Arg3: %s", inArg3)

	if err := call.Response().WriteArg2(tchannel.BytesOutput(inArg2)); err != nil {
		log.Errorf("could not write arg2: %v", err)
		return
	}

	if err := call.Response().WriteArg3(tchannel.BytesOutput(inArg3)); err != nil {
		log.Errorf("could not write arg3: %v", err)
		return
	}
}

func serverBusy(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SendSystemError(tchannel.ErrServerBusy)
}

func badRequest(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SendSystemError(tchannel.ErrHandlerNotFound)
}

func timeout(ctx context.Context, call *tchannel.InboundCall) {
	deadline, _ := ctx.Deadline()
	log.Infof("Client requested timeout in %dms", int(deadline.Sub(time.Now()).Seconds()*1000))

	pastDeadline := deadline.Add(time.Second * 2)
	time.Sleep(pastDeadline.Sub(time.Now()))
	echo(ctx, call)
}

func appError(ctx context.Context, call *tchannel.InboundCall) {
	call.Response().SetApplicationError()
	echo(ctx, call)
}

var bindAddr = flag.String("bind", "127.0.0.1:10500", "host and port on which to bind")

func main() {
	flag.Parse()

	ch, err := tchannel.NewChannel("hello-server", &tchannel.ChannelOptions{
		Logger: log,
	})
	if err != nil {
		log.Fatalf("could not create channel %v", err)
	}

	ch.Register(tchannel.HandlerFunc(echo), "TestService", "echo")
	ch.Register(tchannel.HandlerFunc(serverBusy), "TestService", "busy")
	ch.Register(tchannel.HandlerFunc(badRequest), "TestService", "badRequest")
	ch.Register(tchannel.HandlerFunc(appError), "TestService", "appError")
	ch.Register(tchannel.HandlerFunc(timeout), "TestService", "timeout")

	if err := ch.ListenAndServe(*bindAddr); err != nil {
		log.Fatalf("Could not listen on %s: %v", *bindAddr, err)
	}
}
