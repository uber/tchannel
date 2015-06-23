package tchannel

// This file contains test setup logic, and is named with a _test.go suffix to
// ensure it's only compiled with tests.

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
	"fmt"
	"net"
)

var connectionLog = flag.Bool("connectionLog", false, "Enables connection logging in tests")

// testChannelOpts contains options to create a test channel using WithTes
type testChannelOpts struct {
	// ServiceName defaults to "testServer"
	ServiceName string

	// ProcessName defaults to ServiceName + "-[port]"
	ProcessName string

	// EnableLog defaults to false.
	EnableLog bool

	// DefaultConnectionOptions specifies the channel's default connection options.
	DefaultConnectionOptions ConnectionOptions
}

func defaultString(v string, defaultValue string) string {
	if v == "" {
		return defaultValue
	}
	return v
}

// withServerChannel sets up a TChannel for tests and runs the given function with the channel.
func withServerChannel(opts *testChannelOpts, f func(ch *Channel, hostPort string)) error {
	if opts == nil {
		opts = &testChannelOpts{}
	}

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("failed to listen: %v", err)
	}
	_, port, err := net.SplitHostPort(l.Addr().String())
	if err != nil {
		return fmt.Errorf("could not get listening port from %v: %v", l.Addr().String(), err)
	}
	serviceName := defaultString(opts.ServiceName, "testServer")
	processName := defaultString(opts.ProcessName, serviceName+"-"+port)

	var logger Logger
	if opts.EnableLog || *connectionLog {
		logger = SimpleLogger
	}

	ch, err := NewChannel(serviceName, &ChannelOptions{
		ProcessName: processName,
		Logger:      logger,
		DefaultConnectionOptions: opts.DefaultConnectionOptions,
	})
	if err != nil {
		return fmt.Errorf("NewChannel failed: %v", err)
	}

	if err := ch.Serve(l); err != nil {
		return fmt.Errorf("Serve failed: %v", err)
	}
	f(ch, l.Addr().String())
	ch.Close()
	return nil
}
