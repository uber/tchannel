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
	"errors"
	"os"
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
	testServiceName = "TestService"
	testProcessName = "Test Channel"
	testArg2        = []byte("Header in arg2")
	testArg3        = []byte("Body in arg3")
)

type testHandler struct {
	t      *testing.T
	format Format
	caller string
}

func newTestHandler(t *testing.T) *testHandler {
	return &testHandler{t: t}
}

func (h *testHandler) Handle(ctx context.Context, args *rawArgs) (*rawRes, error) {
	h.format = args.Format
	h.caller = args.Caller

	switch args.Operation {
	case "timeout":
		deadline, _ := ctx.Deadline()
		time.Sleep(deadline.Add(time.Second * 1).Sub(time.Now()))
		h.t.FailNow()
	case "echo":
		return &rawRes{
			Arg2: args.Arg2,
			Arg3: args.Arg3,
		}, nil
	case "busy":
		return &rawRes{
			SystemErr: ErrServerBusy,
		}, nil
	case "app-error":
		return &rawRes{
			IsErr: true,
		}, nil
	}
	return nil, errors.New("unknown operation")
}

func (h *testHandler) OnError(ctx context.Context, err error) {
	h.t.Errorf("testHandler got error: %v", err)
}

func TestRoundTrip(t *testing.T) {
	withTestChannel(t, "Capture", func(ch *Channel, hostPort string) {
		handler := newTestHandler(t)
		ch.Register(AsRaw(handler), "echo")

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		call, err := ch.BeginCall(ctx, hostPort, "Capture", "echo", &CallOptions{Format: JSON})
		require.NoError(t, err)

		require.NoError(t, NewArgWriter(call.Arg2Writer()).Write(testArg2))
		require.NoError(t, NewArgWriter(call.Arg3Writer()).Write(testArg3))

		var respArg2 []byte
		require.NoError(t, NewArgReader(call.Response().Arg2Reader()).Read(&respArg2))
		assert.Equal(t, testArg2, []byte(respArg2))

		var respArg3 []byte
		require.NoError(t, NewArgReader(call.Response().Arg3Reader()).Read(&respArg3))
		assert.Equal(t, testArg3, []byte(respArg3))

		assert.Equal(t, JSON, handler.format)
		assert.Equal(t, "Capture", handler.caller)
		assert.Equal(t, JSON, call.Response().Format(), "response Format should match request Format")
	})
}

func TestDefaultFormat(t *testing.T) {
	withTestChannel(t, "Capture", func(ch *Channel, hostPort string) {
		handler := newTestHandler(t)
		ch.Register(AsRaw(handler), "echo")

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		arg2, arg3, resp, err := sendRecv(ctx, ch, hostPort, "Capture", "echo", testArg2, testArg3)
		require.Nil(t, err)

		require.Equal(t, testArg2, arg2)
		require.Equal(t, testArg3, arg3)
		require.Equal(t, Raw, handler.format)
		assert.Equal(t, "Capture", handler.caller)
		assert.Equal(t, Raw, resp.Format(), "response Format should match request Format")
	})
}

func TestReuseConnection(t *testing.T) {
	ctx, cancel := NewContext(time.Second * 5)
	defer cancel()

	withTestChannel(t, "s1", func(ch1 *Channel, hostPort1 string) {
		withTestChannel(t, "s2", func(ch2 *Channel, hostPort2 string) {
			ch1.Register(AsRaw(newTestHandler(t)), "echo")
			ch2.Register(AsRaw(newTestHandler(t)), "echo")

			// We need the servers to have their peers set before making outgoing calls
			// for the outgoing calls to contain the correct peerInfo.
			require.True(t, testutils.WaitFor(time.Second, func() bool {
				return !ch1.PeerInfo().IsEphemeral() && !ch2.PeerInfo().IsEphemeral()
			}))

			outbound, err := ch1.BeginCall(ctx, hostPort2, "s2", "echo", nil)
			require.NoError(t, err)

			// Try to make another call at the same time, should reuse the same connection.
			outbound2, err := ch1.BeginCall(ctx, hostPort2, "s2", "echo", nil)
			require.NoError(t, err)
			assert.Equal(t, outbound.conn, outbound2.conn)

			// When ch2 tries to call ch1, it should reuse the inbound connection from ch1.
			outbound3, err := ch2.BeginCall(ctx, hostPort1, "s1", "echo", nil)
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

func TestPing(t *testing.T) {
	withTestChannel(t, "ping-host", func(ch *Channel, hostPort string) {
		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		opts := &ChannelOptions{
			ProcessName: "ping-client",
			Logger:      SimpleLogger,
		}
		clientCh, err := NewChannel("ping-test", opts)
		require.NoError(t, err)
		require.NoError(t, clientCh.Ping(ctx, hostPort))
	})
}

func TestBadRequest(t *testing.T) {
	withTestChannel(t, "svc", func(ch *Channel, hostPort string) {
		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBadRequest, GetSystemErrorCode(err))
	})
}

func TestNoTimeout(t *testing.T) {
	withTestChannel(t, "svc", func(ch *Channel, hostPort string) {
		ch.Register(AsRaw(newTestHandler(t)), "Echo")

		ctx := context.Background()
		_, _, _, err := sendRecv(ctx, ch, hostPort, "svc", "Echo", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrTimeoutRequired, err)
	})
}

func TestServerBusy(t *testing.T) {
	withTestChannel(t, testServiceName, func(ch *Channel, hostPort string) {
		ch.Register(AsRaw(newTestHandler(t)), "busy")

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, testServiceName, "busy", []byte("Arg2"), []byte("Arg3"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBusy, GetSystemErrorCode(err))
	})
}

func TestTimeout(t *testing.T) {
	withTestChannel(t, testServiceName, func(ch *Channel, hostPort string) {
		ch.Register(AsRaw(newTestHandler(t)), "timeout")

		ctx, cancel := NewContext(time.Millisecond * 100)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, "TestService", "timeout", []byte("Arg2"), []byte("Arg3"))

		// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
		assert.Equal(t, context.DeadlineExceeded, err)
	})
}

func TestFragmentation(t *testing.T) {
	withTestChannel(t, testServiceName, func(ch *Channel, hostPort string) {
		ch.Register(AsRaw(newTestHandler(t)), "echo")

		arg2 := make([]byte, MaxFramePayloadSize*2)
		for i := 0; i < len(arg2); i++ {
			arg2[i] = byte('a' + (i % 10))
		}

		arg3 := make([]byte, MaxFramePayloadSize*3)
		for i := 0; i < len(arg3); i++ {
			arg3[i] = byte('A' + (i % 10))
		}

		ctx, cancel := NewContext(time.Second * 10)
		defer cancel()

		respArg2, respArg3, _, err := sendRecv(ctx, ch, hostPort, testServiceName, "echo", arg2, arg3)
		require.NoError(t, err)
		assert.Equal(t, arg2, respArg2)
		assert.Equal(t, arg3, respArg3)
	})
}

func TestStatsCalls(t *testing.T) {
	statsReporter := newRecordingStatsReporter()
	testOpts := &testChannelOpts{
		StatsReporter: statsReporter,
	}
	require.NoError(t, withServerChannel(testOpts, func(ch *Channel, hostPort string) {
		ch.Register(AsRaw(newTestHandler(t)), "echo")

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		_, _, _, err := sendRecv(ctx, ch, hostPort, ch.PeerInfo().ServiceName, "echo", []byte("Headers"), []byte("Body"))
		require.NoError(t, err)

		_, _, _, err = sendRecv(ctx, ch, hostPort, ch.PeerInfo().ServiceName, "error", nil, nil)
		require.Error(t, err)

		host, err := os.Hostname()
		require.Nil(t, err)

		expectedTags := map[string]string{
			"app":             ch.PeerInfo().ProcessName,
			"host":            host,
			"service":         ch.PeerInfo().ServiceName,
			"target-service":  ch.PeerInfo().ServiceName,
			"target-endpoint": "echo",
		}
		statsReporter.Expected.IncCounter("outbound.calls.send", expectedTags, 1)
		statsReporter.Expected.IncCounter("outbound.calls.successful", expectedTags, 1)
		expectedTags["target-endpoint"] = "error"
		statsReporter.Expected.IncCounter("outbound.calls.send", expectedTags, 1)
		// TODO(prashant): Make the following stat work too.
		// statsReporter.Expected.IncCounter("outbound.calls.app-errors", expectedTags, 1)
		statsReporter.ValidateCounters(t)
	}))
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

func withTestChannel(t *testing.T, serviceName string, f func(ch *Channel, hostPort string)) {
	require.NoError(t, withServerChannel(&testChannelOpts{
		ServiceName: serviceName,
	}, f))
}
