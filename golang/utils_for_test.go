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

	"golang.org/x/net/context"
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

// rawHandler is the interface for a raw handler.
// TODO(prashant): Make Raw/JSON handlers that can be used by external users.
type rawHandler interface {
	// Handle is called on incoming calls, and contains all the arguments.
	// If an error is returned, it will set ApplicationError Arg3 will be the error string.
	Handle(ctx context.Context, args *rawArgs) (*rawRes, error)
	OnError(ctx context.Context, err error)
}

// rawArgs parses the arguments from an incoming call req.
type rawArgs struct {
	Caller    string
	Format    Format
	Operation string
	Arg2      []byte
	Arg3      []byte
}

// rawRes represents the response to an incoming call req.
type rawRes struct {
	SystemErr error
	// IsErr is used to set an application error on the underlying call res.
	IsErr bool
	Arg2  []byte
	Arg3  []byte
}

// AsRaw wraps a RawHandler as a Handler that can be passed to Register.
func AsRaw(handler rawHandler) Handler {
	return HandlerFunc(func(ctx context.Context, call *InboundCall) {
		var args rawArgs
		args.Caller = call.CallerName()
		args.Format = call.Format()
		args.Operation = string(call.Operation())
		if err := NewArgReader(call.Arg2Reader()).Read(&args.Arg2); err != nil {
			handler.OnError(ctx, err)
			return
		}
		if err := NewArgReader(call.Arg3Reader()).Read(&args.Arg3); err != nil {
			handler.OnError(ctx, err)
			return
		}

		resp, err := handler.Handle(ctx, &args)
		response := call.Response()
		if err != nil {
			resp = &rawRes{
				IsErr: true,
				Arg2:  nil,
				Arg3:  []byte(err.Error()),
			}
		}

		if resp.SystemErr != nil {
			if err := response.SendSystemError(resp.SystemErr); err != nil {
				handler.OnError(ctx, err)
			}
			return
		}
		if resp.IsErr {
			if err := response.SetApplicationError(); err != nil {
				handler.OnError(ctx, err)
				return
			}
		}
		if err := NewArgWriter(response.Arg2Writer()).Write(resp.Arg2); err != nil {
			handler.OnError(ctx, err)
			return
		}
		if err := NewArgWriter(response.Arg3Writer()).Write(resp.Arg3); err != nil {
			handler.OnError(ctx, err)
			return
		}
	})
}
