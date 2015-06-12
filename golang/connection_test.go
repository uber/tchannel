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
	"net"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

// Values used in tests
var (
	testServiceName = "test-channel"
	testProcessName = "Test Channel"
	testArg2        = []byte("Header in arg2")
	testArg3        = []byte("Body in arg3")
)

func testHandlerFunc(t *testing.T, f func(t *testing.T, ctx context.Context, call *InboundCall)) Handler {
	return HandlerFunc(func(ctx context.Context, call *InboundCall) {
		f(t, ctx, call)
	})
}

func serverBusy(t *testing.T, ctx context.Context, call *InboundCall) {
	call.Response().SendSystemError(ErrServerBusy)
}

func timeout(t *testing.T, ctx context.Context, call *InboundCall) {
	deadline, _ := ctx.Deadline()
	time.Sleep(deadline.Add(time.Second * 1).Sub(time.Now()))
	(&echoSaver{}).echo(t, ctx, call)
}

type echoSaver struct {
	format Format
	caller string
}

func (e *echoSaver) echo(t *testing.T, ctx context.Context, call *InboundCall) {
	var inArg2 []byte
	var inArg3 []byte

	e.format = call.Format()
	e.caller = call.CallerName()

	require.NoError(t, NewArgReader(call.Arg2Reader()).Read(&inArg2))
	require.NoError(t, NewArgReader(call.Arg3Reader()).Read(&inArg3))
	require.NoError(t, NewArgWriter(call.Response().Arg2Writer()).Write(inArg2))
	require.NoError(t, NewArgWriter(call.Response().Arg3Writer()).Write(inArg3))
}

func TestRoundTrip(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		echoSaver := &echoSaver{}
		ch.Register(testHandlerFunc(t, echoSaver.echo), "Capture", "ping")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		call, err := ch.BeginCall(ctx, hostPort, "Capture", "ping", &CallOptions{Format: JSON})
		require.NoError(t, err)

		require.NoError(t, NewArgWriter(call.Arg2Writer()).Write(testArg2))
		require.NoError(t, NewArgWriter(call.Arg3Writer()).Write(testArg3))

		var respArg2 []byte
		require.NoError(t, NewArgReader(call.Response().Arg2Reader()).Read(&respArg2))
		assert.Equal(t, testArg2, []byte(respArg2))

		var respArg3 []byte
		require.NoError(t, NewArgReader(call.Response().Arg3Reader()).Read(&respArg3))
		assert.Equal(t, testArg3, []byte(respArg3))

		assert.Equal(t, JSON, echoSaver.format)
		assert.Equal(t, testServiceName, echoSaver.caller)
		assert.Equal(t, JSON, call.Response().Format(), "response Format should match request Format")
	})
}

func TestDefaultFormat(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		echoSaver := &echoSaver{}
		ch.Register(testHandlerFunc(t, echoSaver.echo), "Capture", "ping")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		arg2, arg3, resp, err := sendRecv(ctx, ch, hostPort, "Capture", "ping", testArg2, testArg3)
		require.Nil(t, err)

		require.Equal(t, testArg2, arg2)
		require.Equal(t, testArg3, arg3)
		require.Equal(t, Raw, echoSaver.format)
		assert.Equal(t, testServiceName, echoSaver.caller)
		assert.Equal(t, Raw, resp.Format(), "response Format should match request Format")
	})
}

func TestReuseConnection(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	withTestChannel(t, func(ch1 *Channel, hostPort1 string) {
		withTestChannel(t, func(ch2 *Channel, hostPort2 string) {
			ch1.Register(testHandlerFunc(t, (&echoSaver{}).echo), "s1", "op")
			ch2.Register(testHandlerFunc(t, (&echoSaver{}).echo), "s2", "op")

			// We need the servers to have their peers set before making outgoing calls
			// for the outgoing calls to contain the correct peerInfo.
			require.True(t, testutils.WaitFor(time.Second, func() bool {
				return !ch1.PeerInfo().IsEphemeral() && !ch2.PeerInfo().IsEphemeral()
			}))

			outbound, err := ch1.BeginCall(ctx, hostPort2, "s2", "op", nil)
			require.NoError(t, err)

			// Try to make another call at the same time, should reuse the same connection.
			outbound2, err := ch1.BeginCall(ctx, hostPort2, "s2", "op", nil)
			require.NoError(t, err)
			assert.Equal(t, outbound.conn, outbound2.conn)

			// When ch2 tries to call ch1, it should reuse the inbound connection from ch1.
			outbound3, err := ch2.BeginCall(ctx, hostPort1, "s1", "op", nil)
			require.NoError(t, err)
			assert.Equal(t, outbound.conn.conn.RemoteAddr(), outbound3.conn.conn.LocalAddr())
			assert.Equal(t, outbound.conn.conn.LocalAddr(), outbound3.conn.conn.RemoteAddr())

			// Ensure all calls can complete in parallel.
			var wg sync.WaitGroup
			for _, call := range []*OutboundCall{outbound, outbound2, outbound3} {
				wg.Add(1)
				go func(call *OutboundCall) {
					defer wg.Done()
					resp1, resp2, _, err := sendRecvArgs(call, []byte("arg2"), []byte("arg3"))
					require.NoError(t, err)
					assert.Equal(t, resp1, []byte("arg2"), "result does match argument")
					assert.Equal(t, resp2, []byte("arg3"), "result does match argument")
				}(call)
			}
			wg.Wait()
		})
	})
}

func TestBadRequest(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBadRequest, GetSystemErrorCode(err))
	})
}

func TestServerBusy(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(testHandlerFunc(t, serverBusy), "TestService", "busy")

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, "TestService", "busy", []byte("Arg2"), []byte("Arg3"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBusy, GetSystemErrorCode(err))
	})
}

func TestTimeout(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(testHandlerFunc(t, timeout), "TestService", "timeout")

		ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond*100)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, "TestService", "timeout", []byte("Arg2"), []byte("Arg3"))

		// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
		assert.Equal(t, context.DeadlineExceeded, err)
	})
}

func TestFragmentation(t *testing.T) {
	withTestChannel(t, func(ch *Channel, hostPort string) {
		ch.Register(testHandlerFunc(t, (&echoSaver{}).echo), "TestService", "echo")

		arg2 := make([]byte, MaxFramePayloadSize*2)
		for i := 0; i < len(arg2); i++ {
			arg2[i] = byte('a' + (i % 10))
		}

		arg3 := make([]byte, MaxFramePayloadSize*3)
		for i := 0; i < len(arg3); i++ {
			arg3[i] = byte('A' + (i % 10))
		}

		ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
		defer cancel()

		respArg2, respArg3, _, err := sendRecv(ctx, ch, hostPort, "TestService", "echo", arg2, arg3)
		require.NoError(t, err)
		assert.Equal(t, arg2, respArg2)
		assert.Equal(t, arg3, respArg3)
	})
}

func sendRecvArgs(call *OutboundCall, arg2, arg3 []byte) ([]byte, []byte, *OutboundCallResponse, error) {
	if err := NewArgWriter(call.Arg2Writer()).Write(arg2); err != nil {
		return nil, nil, nil, err
	}

	if err := NewArgWriter(call.Arg3Writer()).Write(arg3); err != nil {
		return nil, nil, nil, err
	}

	resp := call.Response()
	var respArg2 []byte
	if err := NewArgReader(resp.Arg2Reader()).Read(&respArg2); err != nil {
		return nil, nil, nil, err
	}

	var respArg3 []byte
	if err := NewArgReader(resp.Arg3Reader()).Read(&respArg3); err != nil {
		return nil, nil, nil, err
	}

	return respArg2, respArg3, resp, nil
}

func sendRecv(ctx context.Context, ch *Channel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, *OutboundCallResponse, error) {

	call, err := ch.BeginCall(ctx, hostPort, serviceName, operation, nil)
	if err != nil {
		return nil, nil, nil, err
	}

	return sendRecvArgs(call, arg2, arg3)
}

func withTestChannel(t *testing.T, f func(ch *Channel, hostPort string)) {
	opts := ChannelOptions{
		ProcessName: testProcessName,
		Logger:      SimpleLogger,
	}

	ch, err := NewChannel(testServiceName, &opts)
	require.Nil(t, err)

	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.Nil(t, err)

	go ch.Serve(l)

	f(ch, l.Addr().String())

	ch.Close()
}
