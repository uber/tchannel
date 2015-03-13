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
	"github.com/op/go-logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/net/context"
	"testing"
	"time"
)

var testLog = logging.MustGetLogger("test")

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
		testLog.Error("could not start arg2: %v", err)
		return
	}

	testLog.Info("Arg2: %s", inArg2)

	var inArg3 BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		testLog.Error("could not start arg3: %v", err)
		return
	}

	testLog.Info("Arg3: %s", inArg3)

	if err := call.Response().WriteArg2(BytesOutput(inArg2)); err != nil {
		testLog.Error("could not write arg2: %v", err)
		return
	}

	if err := call.Response().WriteArg3(BytesOutput(inArg3)); err != nil {
		testLog.Error("could not write arg3: %v", err)
		return
	}
}

func TestRoundTrip(t *testing.T) {
	ch, err := NewChannel(":0", nil)
	require.Nil(t, err)
	testLog.Info("Running on %s", ch.HostPort())

	ch.Register(HandlerFunc(echo), "Capture", "ping")

	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	call, err := ch.BeginCall(ctx, ch.HostPort(), "Capture", "ping")
	require.Nil(t, err)

	require.Nil(t, call.WriteArg2(BytesOutput("Hello Header")))
	require.Nil(t, call.WriteArg3(BytesOutput("Body Sent")))

	var respArg2 BytesInput
	require.Nil(t, call.Response().ReadArg2(&respArg2))
	assert.Equal(t, []byte("Hello Header"), []byte(respArg2))

	var respArg3 BytesInput
	require.Nil(t, call.Response().ReadArg3(&respArg3))
	assert.Equal(t, []byte("Body Sent"), []byte(respArg3))
}

func TestBadRequest(t *testing.T) {
	ch, err := NewChannel(":0", nil)
	require.Nil(t, err)
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, ch.HostPort(), "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
	require.NotNil(t, err)
	assert.Equal(t, ErrorCodeBadRequest, GetSystemErrorCode(err))
}

func TestServerBusy(t *testing.T) {
	ch, err := NewChannel(":0", nil)
	require.Nil(t, err)

	ch.Register(HandlerFunc(serverBusy), "TestService", "busy")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, ch.HostPort(), "TestService", "busy", []byte("Arg2"), []byte("Arg3"))
	require.NotNil(t, err)
	assert.Equal(t, ErrorCodeBusy, GetSystemErrorCode(err))
}

func TestTimeout(t *testing.T) {
	ch, err := NewChannel(":0", nil)
	require.Nil(t, err)

	ch.Register(HandlerFunc(timeout), "TestService", "timeout")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, ch.HostPort(), "TestService", "timeout", []byte("Arg2"), []byte("Arg3"))

	// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
	assert.Equal(t, context.DeadlineExceeded, err)
}

func TestFragmentation(t *testing.T) {
	ch, err := NewChannel(":0", nil)
	require.Nil(t, err)

	ch.Register(HandlerFunc(echo), "TestService", "echo")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	arg2 := make([]byte, MaxFramePayloadSize*2)
	for i := 0; i < len(arg2); i++ {
		arg2[i] = byte(i&0x0F) + 50
	}

	arg3 := make([]byte, MaxFramePayloadSize*3)
	for i := 0; i < len(arg3); i++ {
		arg3[i] = byte(i&0xF0) + 100
	}

	respArg2, respArg3, err := sendRecv(ctx, ch, ch.HostPort(), "TestService", "echo", arg2, arg3)
	require.Nil(t, err)
	assert.Equal(t, arg2, respArg2)
	assert.Equal(t, arg3, respArg3)
}

func sendRecv(ctx context.Context, ch *TChannel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, error) {

	call, err := ch.BeginCall(ctx, hostPort, serviceName, operation)
	if err != nil {
		return nil, nil, err
	}

	if err := call.WriteArg2(BytesOutput(arg2)); err != nil {
		return nil, nil, err
	}

	if err := call.WriteArg3(BytesOutput(arg3)); err != nil {
		return nil, nil, err
	}

	var respArg2 BytesInput
	if err := call.Response().ReadArg2(&respArg2); err != nil {
		return nil, nil, err
	}

	var respArg3 BytesInput
	if err := call.Response().ReadArg3(&respArg3); err != nil {
		return nil, nil, err
	}

	return []byte(respArg2), []byte(respArg3), nil
}
