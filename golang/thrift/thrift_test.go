package thrift_test

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
	"testing"
	"time"

	// Test is in a separate package to avoid circular dependencies.
	. "github.com/uber/tchannel/golang/thrift"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	tchannel "github.com/uber/tchannel/golang"
	gen "github.com/uber/tchannel/golang/thrift/gen-go/test"
	"github.com/uber/tchannel/golang/thrift/mocks"
)

// Generate the service mocks using go generate.
//go:generate mockery -name TChanSimpleService
//go:generate mockery -name TChanSecondService

type testArgs struct {
	s1 *mocks.TChanSimpleService
	s2 *mocks.TChanSecondService
	c1 gen.TChanSimpleService
	c2 gen.TChanSecondService
}

func ctxArg() mock.AnythingOfTypeArgument {
	return mock.AnythingOfType("*thrift.thriftCtx")
}

func TestThriftArgs(t *testing.T) {
	withSetup(t, func(ctx Context, args testArgs) {
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

		args.s1.On("Call", ctxArg(), arg).Return(ret, nil)
		got, err := args.c1.Call(ctx, arg)
		require.NoError(t, err)
		assert.Equal(t, ret, got)
	})
}

func TestRequest(t *testing.T) {
	withSetup(t, func(ctx Context, args testArgs) {
		args.s1.On("Simple", ctxArg()).Return(nil)
		require.NoError(t, args.c1.Simple(ctx))
	})
}

func TestThriftError(t *testing.T) {
	thriftErr := &gen.SimpleErr{
		Message: "this is the error",
	}
	withSetup(t, func(ctx Context, args testArgs) {
		args.s1.On("Simple", ctxArg()).Return(thriftErr)
		got := args.c1.Simple(ctx)
		require.Error(t, got)
		require.Equal(t, thriftErr, got)
	})
}

func TestUnknownError(t *testing.T) {
	withSetup(t, func(ctx Context, args testArgs) {
		args.s1.On("Simple", ctxArg()).Return(errors.New("unexpected err"))
		got := args.c1.Simple(ctx)
		require.Error(t, got)
		require.Equal(t, tchannel.NewSystemError(tchannel.ErrCodeUnexpected, "unexpected err"), got)
	})
}

func TestMultiple(t *testing.T) {
	withSetup(t, func(ctx Context, args testArgs) {
		args.s1.On("Simple", ctxArg()).Return(nil)
		args.s2.On("Echo", ctxArg(), "test1").Return("test2", nil)

		require.NoError(t, args.c1.Simple(ctx))
		res, err := args.c2.Echo(ctx, "test1")
		require.NoError(t, err)
		require.Equal(t, "test2", res)
	})
}

func TestHeaders(t *testing.T) {
	reqHeaders := map[string]string{"header1": "value1", "header2": "value2"}
	respHeaders := map[string]string{"resp1": "value1-resp", "resp2": "value2-resp"}

	withSetup(t, func(ctx Context, args testArgs) {
		args.s1.On("Simple", ctxArg()).Return(nil).Run(func(args mock.Arguments) {
			ctx := args.Get(0).(Context)
			assert.Equal(t, reqHeaders, ctx.Headers(), "request headers mismatch")
			ctx.SetResponseHeaders(respHeaders)
		})

		ctx = WithHeaders(ctx, reqHeaders)
		require.NoError(t, args.c1.Simple(ctx))
		assert.Equal(t, respHeaders, ctx.ResponseHeaders(), "response headers mismatch")
	})
}

func withSetup(t *testing.T, f func(ctx Context, args testArgs)) {
	args := testArgs{
		s1: new(mocks.TChanSimpleService),
		s2: new(mocks.TChanSecondService),
	}

	ctx, cancel := NewContext(time.Second * 10)
	defer cancel()

	// Start server
	tchan, listener, err := setupServer(args.s1, args.s2)
	require.NoError(t, err)
	defer tchan.Close()

	// Get client1
	args.c1, args.c2, err = getClients(listener.Addr().String())
	require.NoError(t, err)

	f(ctx, args)

	args.s1.AssertExpectations(t)
	args.s2.AssertExpectations(t)
}

func setupServer(h *mocks.TChanSimpleService, sh *mocks.TChanSecondService) (*tchannel.Channel, net.Listener, error) {
	tchan, err := tchannel.NewChannel("service", nil)
	if err != nil {
		return nil, nil, err
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, nil, err
	}

	server := NewServer(tchan)
	server.Register(gen.NewTChanSimpleServiceServer(h))
	server.Register(gen.NewTChanSecondServiceServer(sh))

	tchan.Serve(listener)
	return tchan, listener, nil
}

func getClients(dst string) (gen.TChanSimpleService, gen.TChanSecondService, error) {
	tchan, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, nil, err
	}

	tchan.Peers().Add(dst)
	client := NewClient(tchan, "service", nil)

	simpleClient := gen.NewTChanSimpleServiceClient(client)
	secondClient := gen.NewTChanSecondServiceClient(client)
	return simpleClient, secondClient, nil
}
