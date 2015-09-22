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
	"fmt"
	"testing"
	"time"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/json"
	"github.com/uber/tchannel/golang/raw"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

type TracingRequest struct {
	ForwardCount int
}

type TracingResponse struct {
	TraceID        uint64
	SpanID         uint64
	ParentID       uint64
	TracingEnabled bool
	Child          *TracingResponse
}

type traceHandler struct {
	ch *Channel
	t  *testing.T
}

func (h *traceHandler) call(ctx json.Context, req *TracingRequest) (*TracingResponse, error) {
	span := CurrentSpan(ctx)
	if span == nil {
		return nil, fmt.Errorf("tracing not found")
	}

	var childResp *TracingResponse
	if req.ForwardCount > 0 {
		sc := h.ch.Peers().GetOrAdd(h.ch.PeerInfo().HostPort)
		childResp = new(TracingResponse)
		require.NoError(h.t, json.CallPeer(ctx, sc, h.ch.PeerInfo().ServiceName, "call", nil, childResp))
	}

	return &TracingResponse{
		TraceID:        span.TraceID(),
		SpanID:         span.SpanID(),
		ParentID:       span.ParentID(),
		TracingEnabled: span.TracingEnabled(),
		Child:          childResp,
	}, nil
}

func (h *traceHandler) onError(ctx context.Context, err error) {
	h.t.Errorf("onError %v", err)
}

func TestTracingPropagates(t *testing.T) {
	WithVerifiedServer(t, nil, func(ch *Channel, hostPort string) {
		handler := &traceHandler{t: t, ch: ch}
		json.Register(ch, json.Handlers{
			"call": handler.call,
		}, handler.onError)

		ctx, cancel := json.NewContext(time.Second)
		defer cancel()

		peer := ch.Peers().GetOrAdd(ch.PeerInfo().HostPort)
		var response TracingResponse
		require.NoError(t, json.CallPeer(ctx, peer, ch.PeerInfo().ServiceName, "call", &TracingRequest{
			ForwardCount: 1,
		}, &response))

		clientSpan := CurrentSpan(ctx)
		require.NotNil(t, clientSpan)
		assert.Equal(t, uint64(0), clientSpan.ParentID())
		assert.NotEqual(t, uint64(0), clientSpan.TraceID())
		assert.True(t, clientSpan.TracingEnabled(), "Tracing should be enabled")
		assert.Equal(t, clientSpan.TraceID(), response.TraceID)
		assert.Equal(t, clientSpan.SpanID(), response.ParentID)
		assert.True(t, response.TracingEnabled, "Tracing should be enabled")
		assert.Equal(t, response.TraceID, response.SpanID, "traceID = spanID for root span")

		nestedResponse := response.Child
		require.NotNil(t, nestedResponse)
		assert.Equal(t, clientSpan.TraceID(), nestedResponse.TraceID)
		assert.Equal(t, response.SpanID, nestedResponse.ParentID)
		assert.True(t, response.TracingEnabled, "Tracing should be enabled")
		assert.NotEqual(t, response.SpanID, nestedResponse.SpanID)
	})
}

type traceReportArgs struct {
	Annotations       []Annotation
	BinaryAnnotations []BinaryAnnotation
	TargetEndpoint    TargetEndpoint
}

func TestTraceReportingEnabled(t *testing.T) {
	initialTime := time.Date(2015, 2, 1, 10, 10, 0, 0, time.UTC)

	var gotCalls []traceReportArgs
	var gotSpans []Span
	testTraceReporter := TraceReporterFunc(func(span Span, annotations []Annotation, binaryAnnotations []BinaryAnnotation, targetEndpoint TargetEndpoint) {
		gotCalls = append(gotCalls, traceReportArgs{annotations, binaryAnnotations, targetEndpoint})
		gotSpans = append(gotSpans, span)
	})

	traceReporterOpts := &testutils.ChannelOpts{TraceReporter: testTraceReporter}
	tests := []struct {
		name       string
		serverOpts *testutils.ChannelOpts
		clientOpts *testutils.ChannelOpts
		expected   []Annotation
	}{
		{
			name:       "inbound",
			serverOpts: traceReporterOpts,
			expected: []Annotation{
				{Key: "sr", Timestamp: initialTime.Add(4 * time.Second)},
				{Key: "ss", Timestamp: initialTime.Add(6 * time.Second)},
			},
		},
		{
			name:       "outbound",
			clientOpts: traceReporterOpts,
			expected: []Annotation{
				{Key: "cs", Timestamp: initialTime.Add(1 * time.Second)},
				{Key: "cr", Timestamp: initialTime.Add(3 * time.Second)},
			},
		},
	}

	for _, tt := range tests {
		gotCalls, gotSpans = nil, nil
		addFn := testutils.NowStub(GetTimeNow(), initialTime)
		defer testutils.ResetNowStub(GetTimeNow())
		addFn(time.Second)

		WithVerifiedServer(t, tt.serverOpts, func(ch *Channel, hostPort string) {
			ch.Register(raw.Wrap(newTestHandler(t)), "echo")

			clientCh, err := testutils.NewClient(tt.clientOpts)
			require.NoError(t, err, "NewClient failed")

			ctx, cancel := NewContext(time.Second)
			defer cancel()

			_, _, _, err = raw.Call(ctx, clientCh, hostPort, ch.PeerInfo().ServiceName, "echo", nil, []byte("arg3"))
			require.NoError(t, err, "raw.Call failed")

			binaryAnnotations := []BinaryAnnotation{
				{"cn", clientCh.PeerInfo().ServiceName},
				{"as", Raw.String()},
			}
			targetEndpoint := TargetEndpoint{
				HostPort:    hostPort,
				ServiceName: ch.PeerInfo().ServiceName,
				Operation:   "echo",
			}
			expected := []traceReportArgs{{tt.expected, binaryAnnotations, targetEndpoint}}
			assert.Equal(t, expected, gotCalls, "%v: Report args mismatch", tt.name)
			curSpan := CurrentSpan(ctx)
			assert.Equal(t, NewSpan(curSpan.TraceID(), 0, curSpan.TraceID()), gotSpans[0], "Span mismatch")
		})
	}
}

func TestTraceReportingDisabled(t *testing.T) {
	var gotCalls int
	testTraceReporter := TraceReporterFunc(func(span Span, annotations []Annotation, binaryAnnotations []BinaryAnnotation, targetEndpoint TargetEndpoint) {
		gotCalls++
	})

	traceReporterOpts := &testutils.ChannelOpts{TraceReporter: testTraceReporter}
	WithVerifiedServer(t, traceReporterOpts, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "echo")

		ctx, cancel := NewContext(time.Second)
		defer cancel()

		CurrentSpan(ctx).EnableTracing(false)
		_, _, _, err := raw.Call(ctx, ch, hostPort, ch.PeerInfo().ServiceName, "echo", nil, []byte("arg3"))
		require.NoError(t, err, "raw.Call failed")

		assert.Equal(t, 0, gotCalls, "TraceReporter should not report if disabled")
	})
}
