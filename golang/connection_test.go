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

package tchannel_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/raw"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

// Values used in tests
var (
	testServiceName = testutils.DefaultServerName
	testArg2        = []byte("Header in arg2")
	testArg3        = []byte("Body in arg3")
)

type testHandler struct {
	t      *testing.T
	mut    sync.Mutex
	format Format
	caller string
}

func newTestHandler(t *testing.T) *testHandler {
	return &testHandler{t: t}
}

func (h *testHandler) Handle(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	h.mut.Lock()
	h.format = args.Format
	h.caller = args.Caller
	h.mut.Unlock()

	assert.Equal(h.t, args.Caller, CurrentCall(ctx).CallerName())

	switch args.Operation {
	case "timeout":
		deadline, _ := ctx.Deadline()
		time.Sleep(deadline.Add(time.Second).Sub(time.Now()))
		return nil, errors.New("timeout")
	case "echo":
		return &raw.Res{
			Arg2: args.Arg2,
			Arg3: args.Arg3,
		}, nil
	case "busy":
		return &raw.Res{
			SystemErr: ErrServerBusy,
		}, nil
	case "app-error":
		return &raw.Res{
			IsErr: true,
		}, nil
	}
	return nil, errors.New("unknown operation")
}

func (h *testHandler) OnError(ctx context.Context, err error) {
	h.t.Errorf("testHandler got error: %v", err)
}

func TestRoundTrip(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		handler := newTestHandler(t)
		ch.Register(raw.Wrap(handler), "echo")

		ctx, cancel := NewContext(time.Second)
		defer cancel()

		call, err := ch.BeginCall(ctx, hostPort, testServiceName, "echo", &CallOptions{Format: JSON})
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
		assert.Equal(t, testServiceName, handler.caller)
		assert.Equal(t, JSON, call.Response().Format(), "response Format should match request Format")
	})
}

func TestDefaultFormat(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		handler := newTestHandler(t)
		ch.Register(raw.Wrap(handler), "echo")

		ctx, cancel := NewContext(time.Second)
		defer cancel()

		arg2, arg3, resp, err := raw.Call(ctx, ch, hostPort, testServiceName, "echo", testArg2, testArg3)
		require.Nil(t, err)

		require.Equal(t, testArg2, arg2)
		require.Equal(t, testArg3, arg3)
		require.Equal(t, Raw, handler.format)
		assert.Equal(t, Raw, resp.Format(), "response Format should match request Format")
	})
}

func TestReuseConnection(t *testing.T) {
	ctx, cancel := NewContext(time.Second)
	defer cancel()

	s1Opts := &testutils.ChannelOpts{ServiceName: "s1"}
	WithVerifiedServer(t, s1Opts, func(ch1 *Channel, hostPort1 string) {
		s2Opts := &testutils.ChannelOpts{ServiceName: "s2"}
		WithVerifiedServer(t, s2Opts, func(ch2 *Channel, hostPort2 string) {
			ch1.Register(raw.Wrap(newTestHandler(t)), "echo")
			ch2.Register(raw.Wrap(newTestHandler(t)), "echo")

			// We need the servers to have their peers set before making outgoing calls
			// for the outgoing calls to contain the correct peerInfo.
			require.True(t, testutils.WaitFor(time.Second, func() bool {
				return !ch1.PeerInfo().IsEphemeral() && !ch2.PeerInfo().IsEphemeral()
			}))

			outbound, err := ch1.BeginCall(ctx, hostPort2, "s2", "echo", nil)
			require.NoError(t, err)
			outboundConn, outboundNetConn := OutboundConnection(outbound)

			// Try to make another call at the same time, should reuse the same connection.
			outbound2, err := ch1.BeginCall(ctx, hostPort2, "s2", "echo", nil)
			require.NoError(t, err)
			outbound2Conn, _ := OutboundConnection(outbound)
			assert.Equal(t, outboundConn, outbound2Conn)

			// When ch2 tries to call ch1, it should reuse the inbound connection from ch1.
			outbound3, err := ch2.BeginCall(ctx, hostPort1, "s1", "echo", nil)
			require.NoError(t, err)
			_, outbound3NetConn := OutboundConnection(outbound3)
			assert.Equal(t, outboundNetConn.RemoteAddr(), outbound3NetConn.LocalAddr())
			assert.Equal(t, outboundNetConn.LocalAddr(), outbound3NetConn.RemoteAddr())

			// Ensure all calls can complete in parallel.
			var wg sync.WaitGroup
			for _, call := range []*OutboundCall{outbound, outbound2, outbound3} {
				wg.Add(1)
				go func(call *OutboundCall) {
					defer wg.Done()
					resp1, resp2, _, err := raw.WriteArgs(call, []byte("arg2"), []byte("arg3"))
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
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ctx, cancel := NewContext(time.Second)
		defer cancel()

		clientCh, err := testutils.NewClient(nil)
		require.NoError(t, err)
		require.NoError(t, clientCh.Ping(ctx, hostPort))
	})
}

func TestBadRequest(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ctx, cancel := NewContext(time.Second)
		defer cancel()

		_, _, _, err := raw.Call(ctx, ch, hostPort, "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBadRequest, GetSystemErrorCode(err))
	})
}

func TestNoTimeout(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "Echo")

		ctx := context.Background()
		_, _, _, err := raw.Call(ctx, ch, hostPort, "svc", "Echo", []byte("Headers"), []byte("Body"))
		require.NotNil(t, err)
		assert.Equal(t, ErrTimeoutRequired, err)
	})
}

func TestServerBusy(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "busy")

		ctx, cancel := NewContext(time.Second)
		defer cancel()

		_, _, _, err := raw.Call(ctx, ch, hostPort, testServiceName, "busy", []byte("Arg2"), []byte("Arg3"))
		require.NotNil(t, err)
		assert.Equal(t, ErrCodeBusy, GetSystemErrorCode(err), "err: %v", err)
	})
}

func TestTimeout(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "timeout")

		ctx, cancel := NewContext(30 * time.Millisecond)
		defer cancel()

		_, _, _, err := raw.Call(ctx, ch, hostPort, testServiceName, "timeout", []byte("Arg2"), []byte("Arg3"))

		// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
		assert.Equal(t, context.DeadlineExceeded, err)
	})
}

func TestLargeOperation(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ctx, cancel := NewContext(time.Second)
		defer cancel()

		largeOperation := testutils.RandBytes(16*1024 + 1)
		_, _, _, err := raw.Call(ctx, ch, hostPort, testServiceName, string(largeOperation), nil, nil)
		assert.Equal(t, ErrOperationTooLarge, err)
	})
}

func TestFragmentation(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "echo")

		arg2 := make([]byte, MaxFramePayloadSize*2)
		for i := 0; i < len(arg2); i++ {
			arg2[i] = byte('a' + (i % 10))
		}

		arg3 := make([]byte, MaxFramePayloadSize*3)
		for i := 0; i < len(arg3); i++ {
			arg3[i] = byte('A' + (i % 10))
		}

		ctx, cancel := NewContext(time.Second)
		defer cancel()

		respArg2, respArg3, _, err := raw.Call(ctx, ch, hostPort, testServiceName, "echo", arg2, arg3)
		require.NoError(t, err)
		assert.Equal(t, arg2, respArg2)
		assert.Equal(t, arg3, respArg3)
	})
}
