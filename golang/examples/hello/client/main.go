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
	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
	"flag"
	"os"
	"time"
)

var log = tchannel.SimpleLogger

var peerAddr = flag.String("peer", "localhost:10500", "Host and port of remote peer")
var serviceName = flag.String("service", "TestService", "Name of service to invoke")
var operationName = flag.String("operation", "echo", "Name of operation to invoke")
var arg2 = flag.String("arg2", "hello", "Input for arg2.  Curl-style, use @foo.txt to read from foo.txt")
var arg3 = flag.String("arg3", "world", "Input for arg3.  Curl-style, use @foo.txt to read from foo.txt")
var timeout = flag.Int("timeout", 30, "Timeout (in seconds)")

func asArgument(arg string) tchannel.Output {
	if arg[0] == '@' {
		f, err := os.Open(arg[1:])
		if err != nil {
			log.Errorf(err.Error())
			os.Exit(-1)
		}

		return tchannel.NewStreamingOutput(f)
	}

	return tchannel.BytesOutput([]byte(arg))

}

func main() {
	flag.Parse()

	ch, err := tchannel.NewChannel(&tchannel.ChannelOptions{
		Logger: log,
	})
	if err != nil {
		log.Errorf("Could not create client channel: %v\n", err)
		os.Exit(-1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*time.Duration(*timeout))
	defer cancel()

	call, err := ch.BeginCall(ctx, *peerAddr, *serviceName, *operationName)
	if err != nil {
		log.Errorf("Could not begin call to %v.%v@%v: %v", *serviceName, *operationName, *peerAddr, err)
		log.Errorf("Is the server running?")

		os.Exit(-1)
	}

	if err = call.WriteArg2(asArgument(*arg2)); err != nil {
		log.Errorf("Could not write arg2: %v", err)
		os.Exit(-1)
	}

	if err = call.WriteArg3(asArgument(*arg3)); err != nil {
		log.Errorf("Could not write arg3: %v", err)
		os.Exit(-1)
	}

	var respArg2 tchannel.BytesInput
	if err = call.Response().ReadArg2(&respArg2); err != nil {
		log.Errorf("Could not read arg2: %v", err)
		os.Exit(-1)
	}

	if call.Response().ApplicationError() {
		log.Warnf("Server returned application error")
	}

	log.Infof("resp-arg2: %s", respArg2)

	var respArg3 tchannel.BytesInput
	if err = call.Response().ReadArg3(&respArg3); err != nil {
		log.Errorf("Could not read arg3: %v", err)
		os.Exit(-1)
	}

	log.Infof("resp-arg3: %s", respArg3)
}
