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
	"runtime"
	"testing"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/testutils"
)

// WithVerifiedServer runs the given test function with a server channel that is verified
// at the end to make sure there are no leaks (e.g. no exchanges leaked).
func WithVerifiedServer(t *testing.T, opts *testutils.ChannelOpts, f func(serverCh *Channel, hostPort string)) {
	ch, err := testutils.NewServer(opts)
	require.NoError(t, err, "NewServer failed")

	f(ch, ch.PeerInfo().HostPort)
	ch.Close()

	// Wait till the channel is closed
	for i := 0; i < 10; i++ {
		if ch.State() == ChannelClosed {
			break
		}
		runtime.Gosched()
	}

	// Check the message exchanges and make sure they are all empty.
	if exchangesLeft := CheckEmptyExchangesConns(GetConnections(ch)); exchangesLeft != "" {
		t.Errorf("Found uncleared message exchanges:\n%v", exchangesLeft)
	}
}
