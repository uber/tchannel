package tchannel

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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/net/context"
	"net"
	"testing"
	"time"
)

func serverBusy(ctx context.Context, call *InboundCall) {
	call.Response().SendSystemError(ErrServerBusy)
}

func timeout(ctx context.Context, call *InboundCall) {
	deadline, _ := ctx.Deadline()
	time.Sleep(deadline.Add(time.Second * 1).Sub(time.Now()))
	echo(ctx, call)
}

func echo(ctx context.Context, call *InboundCall) {
	var inArg2 BytesInput
	if err := call.ReadArg2(&inArg2); err != nil {
		return
	}

	var inArg3 BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		return
	}

	if err := call.Response().WriteArg2(BytesOutput(inArg2)); err != nil {
		return
	}

	if err := call.Response().WriteArg3(BytesOutput(inArg3)); err != nil {
		return
	}
}

func TestRoundTrip(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {

		ch.Register(HandlerFunc(echo), "Capture", "ping")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		call, err := ch.BeginCall(ctx, hostPort, "Capture", "ping")
		require.Nil(t, err)

		require.Nil(t, call.WriteArg2(BytesOutput("Hello Header")))
		require.Nil(t, call.WriteArg3(BytesOutput("Body Sent")))

		var respArg2 BytesInput
		require.Nil(t, call.Response().ReadArg2(&respArg2))
		assert.Equal(t, []byte("Hello Header"), []byte(respArg2))

		var respArg3 BytesInput
		require.Nil(t, call.Response().ReadArg3(&respArg3))
		assert.Equal(t, []byte("Body Sent"), []byte(respArg3))
	})
}

func TestBadRequest(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		_, _, err := sendRecv(ctx, ch, hostPort, "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBadRequest, GetSystemErrorCode(err))
	})
}

func TestServerBusy(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(HandlerFunc(serverBusy), "TestService", "busy")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		_, _, err := sendRecv(ctx, ch, hostPort, "TestService", "busy", []byte("Arg2"), []byte("Arg3"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBusy, GetSystemErrorCode(err))
	})
}

func TestTimeout(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(HandlerFunc(timeout), "TestService", "timeout")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
		defer cancel()

		_, _, err := sendRecv(ctx, ch, hostPort, "TestService", "timeout", []byte("Arg2"), []byte("Arg3"))

		// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
		assert.Equal(t, context.DeadlineExceeded, err)
	})
}

func testFragmentation(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(HandlerFunc(echo), "TestService", "echo")

		arg2 := make([]byte, MaxFramePayloadSize*2)
		for i := 0; i < len(arg2); i++ {
			arg2[i] = byte(i&0x0F) + 50
		}

		arg3 := make([]byte, MaxFramePayloadSize*3)
		for i := 0; i < len(arg3); i++ {
			arg3[i] = byte(i&0xF0) + 100
		}

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
		defer cancel()

		respArg2, respArg3, err := sendRecv(ctx, ch, hostPort, "TestService", "echo", arg2, arg3)
		require.Nil(t, err)
		assert.Equal(t, arg2, respArg2)
		assert.Equal(t, arg3, respArg3)
	})
}

func sendRecv(ctx context.Context, ch *Channel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, error) {

	var respArg2 BytesInput
	var respArg3 BytesInput
	_, err := ch.RoundTrip(ctx, hostPort, serviceName, operation,
		BytesOutput(arg2), BytesOutput(arg3), &respArg2, &respArg3)
	if err != nil {
		return nil, nil, err
	}

	return []byte(respArg2), []byte(respArg3), nil
}

func withTestChannel(t *testing.T, f func(ch *Channel, hostPort string)) {
	opts := ChannelOptions{
		Logger: SimpleLogger,
	}

	ch, err := NewChannel(&opts)
	require.Nil(t, err)

	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.Nil(t, err)

	go ch.Serve(l)

	f(ch, l.Addr().String())
}
