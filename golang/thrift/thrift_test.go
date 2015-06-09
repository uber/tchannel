package thrift

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
	"errors"
	"net"
	"reflect"
	"testing"
	"time"

	"golang.org/x/net/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	tchannel "github.com/uber/tchannel/golang"
	gen "github.com/uber/tchannel/golang/thrift/gen-go/test"
	"github.com/uber/tchannel/golang/thrift/mocks"
)

// Generate the service mocks using go generate.
//go:generate mockery -name SimpleService
//go:generate mockery -name SecondService

type testArgs struct {
	s1 *mocks.SimpleService
	s2 *mocks.SecondService
	c1 *gen.SimpleServiceClient
	c2 *gen.SecondServiceClient
}

func TestThriftArgs(t *testing.T) {
	withSetup(t, func(ctx context.Context, args testArgs) {
		arg := &gen.Data{
			B1: true,
			S2: "str",
			I3: 102,
		}
		ret := &gen.Data{
			B1: false,
			S2: "return-str",
			I3: 105,
		}

		args.s1.On("Call", arg).Return(ret, nil)
		got, err := args.c1.Call(arg)
		require.NoError(t, err)
		assert.Equal(t, ret, got)
	})
}

func TestRequest(t *testing.T) {
	withSetup(t, func(ctx context.Context, args testArgs) {
		args.s1.On("Simple").Return(nil)
		require.NoError(t, args.c1.Simple())
	})
}

func TestRequestError(t *testing.T) {
	withSetup(t, func(ctx context.Context, args testArgs) {
		args.s1.On("Simple").Return(errors.New("err"))
		got := args.c1.Simple()
		require.Error(t, got)
		require.Equal(t, ErrApplication, got)
	})
}

func TestOneWay(t *testing.T) {
	withSetup(t, func(ctx context.Context, args testArgs) {
		args.s1.On("OneWay").Return(nil)
		require.NoError(t, args.c1.OneWay())

		// One way methods do not propagate any information (even on error)
		args.s1.On("OneWay").Return(errors.New("err"))
		require.NoError(t, args.c1.OneWay())
	})
}

func TestMultiple(t *testing.T) {
	withSetup(t, func(ctx context.Context, args testArgs) {
		args.s1.On("Simple").Return(nil)
		args.s2.On("Echo", "test1").Return("test2", nil)

		require.NoError(t, args.c1.Simple())
		res, err := args.c2.Echo("test1")
		require.NoError(t, err)
		require.Equal(t, "test2", res)
	})
}

func withSetup(t *testing.T, f func(ctx context.Context, args testArgs)) {
	args := testArgs{
		s1: new(mocks.SimpleService),
		s2: new(mocks.SecondService),
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	// Start server
	listener, err := setupServer(args.s1, args.s2)
	require.NoError(t, err)
	defer listener.Close()

	// Get client1
	args.c1, args.c2, err = getClients(ctx, listener.Addr().String())
	require.NoError(t, err)

	f(ctx, args)

	args.s1.AssertExpectations(t)
	args.s2.AssertExpectations(t)
}

func setupServer(h *mocks.SimpleService, sh *mocks.SecondService) (net.Listener, error) {
	tchan, err := tchannel.NewChannel("service", nil)
	if err != nil {
		return nil, err
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, err
	}

	server := NewServer(tchan)
	server.Register("SimpleService", reflect.TypeOf(h), gen.NewSimpleServiceProcessor(h))
	server.Register("SecondService", reflect.TypeOf(sh), gen.NewSecondServiceProcessor(sh))

	go tchan.Serve(listener)
	return listener, nil
}

func getClients(ctx context.Context, dst string) (*gen.SimpleServiceClient, *gen.SecondServiceClient, error) {
	tchan, err := tchannel.NewChannel("client", nil)
	if err != nil {
		return nil, nil, err
	}

	opts := TChanOutboundOptions{
		Context:         ctx,
		Dst:             dst,
		AutobahnService: "service",
		ThriftService:   "SimpleService",
	}
	protocol := NewTChanOutbound(tchan, opts)
	simpleClient := gen.NewSimpleServiceClientProtocol(nil, protocol, protocol)

	opts.ThriftService = "SecondService"
	protocol = NewTChanOutbound(tchan, opts)
	secondClient := gen.NewSecondServiceClientProtocol(nil, protocol, protocol)

	return simpleClient, secondClient, nil
}
