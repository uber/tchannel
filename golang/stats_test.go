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

func TestStatsCalls(t *testing.T) {
	statsReporter := newRecordingStatsReporter()
	testOpts := &testutils.ChannelOpts{
		StatsReporter: statsReporter,
	}
	require.NoError(t, testutils.WithServer(testOpts, func(ch *Channel, hostPort string) {
		ch.Register(raw.Wrap(newTestHandler(t)), "echo")

		ctx, cancel := NewContext(time.Second * 5)
		defer cancel()

		_, _, _, err := raw.Call(ctx, ch, hostPort, testServiceName, "echo", []byte("Headers"), []byte("Body"))
		require.NoError(t, err)

		_, _, _, err = raw.Call(ctx, ch, hostPort, testServiceName, "error", nil, nil)
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
