package testutils

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
	"sync/atomic"

	"github.com/uber/tchannel/golang"
)

var connectionLog = flag.Bool("connectionLog", false, "Enables connection logging in tests")

// Default service names for the test channels.
const (
	DefaultServerName = "testService"
	DefaultClientName = "testService-client"
)

// ChannelOpts contains options to create a test channel using WithServer
type ChannelOpts struct {
	// ServiceName defaults to "testServer"
	ServiceName string

	// ProcessName defaults to ServiceName + "-[port]"
	ProcessName string

	// EnableLog defaults to false.
	EnableLog bool

	// StatsReporter specifies the StatsReporter to use.
	StatsReporter tchannel.StatsReporter

	// DefaultConnectionOptions specifies the channel's default connection options.
	DefaultConnectionOptions tchannel.ConnectionOptions
}

func defaultString(v string, defaultValue string) string {
	if v == "" {
		return defaultValue
	}
	return v
}

func getChannelOptions(opts *ChannelOpts, processName string) *tchannel.ChannelOptions {
	var logger tchannel.Logger
	if opts.EnableLog || *connectionLog {
		logger = tchannel.SimpleLogger
	}

	return &tchannel.ChannelOptions{
		ProcessName: processName,
		Logger:      logger,
		DefaultConnectionOptions: opts.DefaultConnectionOptions,
		StatsReporter:            opts.StatsReporter,
	}
}

// WithServer sets up a TChannel that is listening and runs the given function with the channel.
func WithServer(opts *ChannelOpts, f func(ch *tchannel.Channel, hostPort string)) error {
	ch, err := NewServer(opts)
	if err != nil {
		return err
	}
	f(ch, ch.PeerInfo().HostPort)
	ch.Close()
	return nil
}

// NewServer creates a TChannel that is listening and returns the channel.
func NewServer(opts *ChannelOpts) (*tchannel.Channel, error) {
	if opts == nil {
		opts = &ChannelOpts{}
	}

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("failed to listen: %v", err)
	}
	_, port, err := net.SplitHostPort(l.Addr().String())
	if err != nil {
		return nil, fmt.Errorf("could not get listening port from %v: %v", l.Addr().String(), err)
	}

	serviceName := defaultString(opts.ServiceName, DefaultServerName)
	processName := defaultString(opts.ProcessName, serviceName+"-"+port)
	ch, err := tchannel.NewChannel(serviceName, getChannelOptions(opts, processName))
	if err != nil {
		return nil, fmt.Errorf("NewChannel failed: %v", err)
	}

	if err := ch.Serve(l); err != nil {
		return nil, fmt.Errorf("Serve failed: %v", err)
	}

	return ch, nil
}

var totalClients uint32

// NewClient creates a TChannel that is not listening.
func NewClient(opts *ChannelOpts) (*tchannel.Channel, error) {
	if opts == nil {
		opts = &ChannelOpts{}
	}

	clientNum := atomic.AddUint32(&totalClients, 1)
	serviceName := defaultString(opts.ServiceName, DefaultClientName)
	processName := defaultString(opts.ProcessName, serviceName+"-"+fmt.Sprint(clientNum))
	return tchannel.NewChannel(serviceName, getChannelOptions(opts, processName))
}
