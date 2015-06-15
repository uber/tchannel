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
	"io"
	"os"
	"time"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

var log = tchannel.SimpleLogger

var peerAddr = flag.String("peer", "localhost:10500", "Host and port of remote peer")
var serviceName = flag.String("service", "HelloService", "Name of service to invoke")
var operationName = flag.String("operation", "echo", "Name of operation to invoke")
var arg2 = flag.String("arg2", "hello", "Input for arg2.  Curl-style, use @foo.txt to read from foo.txt")
var arg3 = flag.String("arg3", "world", "Input for arg3.  Curl-style, use @foo.txt to read from foo.txt")
var timeout = flag.Int("timeout", 30, "Timeout (in seconds)")

type osArgWriter struct {
	tchannel.ArgWriter
}

func writeArgument(writer io.WriteCloser, arg string) error {
	defer writer.Close()

	if arg[0] == '@' {
		f, err := os.Open(arg[1:])
		if err != nil {
			log.Fatalf("Could not open %s", arg[1:])
		}

		if _, err := io.Copy(writer, f); err != nil {
			return err
		}
	} else {
		writer.Write([]byte(arg))
	}

	return nil
}

func main() {
	flag.Parse()

	ch, err := tchannel.NewChannel("hello-client", &tchannel.ChannelOptions{
		Logger: log,
	})
	if err != nil {
		log.Fatalf("Could not create client channel: %v\n", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*time.Duration(*timeout))
	defer cancel()

	call, err := ch.BeginCall(ctx, *peerAddr, *serviceName, *operationName, nil)
	if err != nil {
		log.Errorf("Could not begin call to %v.%v@%v: %v", *serviceName, *operationName, *peerAddr, err)
		log.Fatalf("Is the server running?")
	}

	writer, err := call.Arg2Writer()
	if err == nil {
		err = writeArgument(writer, *arg2)
	}
	if err != nil {
		log.Fatalf("Could not write arg2: %v", err)
	}

	writer, err = call.Arg3Writer()
	if err == nil {
		err = writeArgument(writer, *arg3)
	}
	if err != nil {
		log.Fatalf("Could not write arg3: %v", err)
	}

	var respArg2 []byte
	if err := tchannel.NewArgReader(call.Response().Arg2Reader()).Read(&respArg2); err != nil {
		log.Fatalf("Could not read arg2: %v", err)
	}

	if call.Response().ApplicationError() {
		log.Warnf("Server returned application error")
	}

	log.Infof("resp-arg2: %s", respArg2)

	var respArg3 []byte
	if err := tchannel.NewArgReader(call.Response().Arg3Reader()).Read(&respArg3); err != nil {
		log.Fatalf("Could not read arg3: %v", err)
	}

	log.Infof("resp-arg3: %s", respArg3)
}
