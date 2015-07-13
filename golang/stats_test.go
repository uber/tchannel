package tchannel_test

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
	"os"
	"testing"
	"time"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/raw"
	"github.com/uber/tchannel/golang/testutils"
)

func tagsForOutboundCall(serverCh *Channel, clientCh *Channel, operation string) map[string]string {
	host, _ := os.Hostname()
	return map[string]string{
		"app":             clientCh.PeerInfo().ProcessName,
		"host":            host,
		"service":         clientCh.PeerInfo().ServiceName,
		"target-service":  serverCh.PeerInfo().ServiceName,
		"target-endpoint": operation,
	}
}

func tagsForInboundCall(serverCh *Channel, clientCh *Channel, operation string) map[string]string {
	host, _ := os.Hostname()
	return map[string]string{
		"app":             serverCh.PeerInfo().ProcessName,
		"host":            host,
		"service":         serverCh.PeerInfo().ServiceName,
		"calling-service": clientCh.PeerInfo().ServiceName,
		"endpoint":        operation,
	}
}

func TestStatsCalls(t *testing.T) {
	serverStats := newRecordingStatsReporter()
	serverOpts := &testutils.ChannelOpts{
		StatsReporter: serverStats,
	}
	require.NoError(t, testutils.WithServer(serverOpts, func(serverCh *Channel, hostPort string) {
		handler := raw.Wrap(newTestHandler(t))
		serverCh.Register(handler, "echo")
		serverCh.Register(handler, "app-error")

		clientStats := newRecordingStatsReporter()
		ch, err := testutils.NewClient(&testutils.ChannelOpts{StatsReporter: clientStats})
		require.NoError(t, err)

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		_, _, _, err = raw.Call(ctx, ch, hostPort, testServiceName, "echo", []byte("Headers"), []byte("Body"))
		require.NoError(t, err)

		_, _, resp, err := raw.Call(ctx, ch, hostPort, testServiceName, "app-error", nil, nil)
		require.NoError(t, err)
		require.True(t, resp.ApplicationError(), "expected application error")

		outboundTags := tagsForOutboundCall(serverCh, ch, "echo")
		clientStats.Expected.IncCounter("outbound.calls.send", outboundTags, 1)
		clientStats.Expected.IncCounter("outbound.calls.success", outboundTags, 1)
		outboundTags["target-endpoint"] = "app-error"
		clientStats.Expected.IncCounter("outbound.calls.send", outboundTags, 1)
		clientStats.Expected.IncCounter("outbound.calls.app-errors", outboundTags, 1)

		inboundTags := tagsForInboundCall(serverCh, ch, "echo")
		serverStats.Expected.IncCounter("inbound.calls.recvd", inboundTags, 1)
		serverStats.Expected.IncCounter("inbound.calls.success", inboundTags, 1)
		inboundTags["endpoint"] = "app-error"
		serverStats.Expected.IncCounter("inbound.calls.recvd", inboundTags, 1)
		serverStats.Expected.IncCounter("inbound.calls.app-errors", inboundTags, 1)

		clientStats.ValidateCounters(t)
		serverStats.ValidateCounters(t)
	}))
}
