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
	"log"
	"os"
	"os/exec"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

var (
	serviceName    = flag.String("service", "", "The service name to listen on")
	operationName  = flag.String("operation", "", "The operation name to handle")
	hostPort       = flag.String("hostPort", ":0", "The host:port to listen on")
	maxConcurrency = flag.Int("maxSpwan", 1, "The maximum number of concurrent processes")
)

var (
	running   chan struct{}
	spawnArgs []string
)

func parseArgs() {
	flag.Parse()
	spawnArgs = flag.Args()

	if *serviceName == "" {
		log.Fatalf("service must be specified")
	}
	if *operationName == "" {
		log.Fatalf("operation must be specified")
	}
	if len(spawnArgs) == 0 {
		log.Fatalf("Must specify command to run")
	}

	running = make(chan struct{}, *maxConcurrency)
}

func main() {
	parseArgs()

	ch, err := tchannel.NewChannel(*serviceName, nil)
	if err != nil {
		log.Fatalf("NewChannel failed: %v", err)
	}

	ch.Register(tchannel.HandlerFunc(handler), *operationName)
	if err := ch.ListenAndServe(*hostPort); err != nil {
		log.Fatalf("ListenAndServe")
	}

	log.Printf("listening for %v:%v on %v", *serviceName, *operationName, ch.PeerInfo().HostPort)
	select {}
}

func onError(msg string, args ...interface{}) {
	log.Fatalf(msg, args...)
}

func handler(ctx context.Context, call *tchannel.InboundCall) {
	running <- struct{}{}
	defer func() { <-running }()

	var arg2 []byte
	if err := tchannel.NewArgReader(call.Arg2Reader()).Read(&arg2); err != nil {
		log.Fatalf("Arg2Reader failed: %v", err)
	}

	arg3Reader, err := call.Arg3Reader()
	if err != nil {
		log.Fatalf("Arg3Reader failed: %v", err)
	}

	response := call.Response()
	if err := tchannel.NewArgWriter(response.Arg2Writer()).Write(nil); err != nil {
		log.Fatalf("Arg2Writer failed: %v", err)
	}

	arg3Writer, err := response.Arg3Writer()
	if err != nil {
		log.Fatalf("Arg3Writer failed: %v", err)
	}

	if err := spawnProcess(arg3Reader, arg3Writer); err != nil {
		log.Fatalf("spawnProcess failed: %v", err)
	}

	if err := arg3Reader.Close(); err != nil {
		log.Fatalf("Arg3Reader.Close failed: %v", err)
	}
	if err := arg3Writer.Close(); err != nil {
		log.Fatalf("Arg3Writer.Close failed: %v", err)
	}
}

func spawnProcess(reader io.Reader, writer io.Writer) error {
	cmd := exec.Command(spawnArgs[0], spawnArgs[1:]...)
	cmd.Stdin = reader
	cmd.Stdout = writer
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
