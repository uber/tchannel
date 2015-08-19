package tchannel_test

import (
	"strings"
	"testing"
	"time"

	"golang.org/x/net/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	. "github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/raw"
	"github.com/uber/tchannel/golang/testutils"
)

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

func TestActiveCallReq(t *testing.T) {
	ctx, cancel := NewContext(time.Second)
	defer cancel()

	// Note: This test leaks a message exchange due to the modification of IDs in the relay.
	require.NoError(t, testutils.WithServer(nil, func(ch *Channel, hostPort string) {
		gotCall := make(chan struct{})
		unblock := make(chan struct{})

		registerFunc(t, ch, "blocked", func(ctx context.Context, args *raw.Args) (*raw.Res, error) {
			gotCall <- struct{}{}
			<-unblock
			return &raw.Res{}, nil
		})

		relayFunc := func(outgoing bool, frame *Frame) *Frame {
			if outgoing && frame.Header.ID == 2 {
				frame.Header.ID = 3
			}
			return frame
		}

		relayHostPort, closeRelay := testutils.FrameRelay(t, hostPort, relayFunc)
		defer closeRelay()

		go func() {
			// This call will block until we close unblock.
			raw.Call(ctx, ch, relayHostPort, ch.PeerInfo().ServiceName, "blocked", nil, nil)
		}()

		// Wait for the first call to be received by the server
		<-gotCall

		// Make a new call, which should fail
		_, _, _, err := raw.Call(ctx, ch, relayHostPort, ch.PeerInfo().ServiceName, "blocked", nil, nil)
		assert.Error(t, err, "Expect error")
		assert.True(t, strings.Contains(err.Error(), "already active"),
			"expected already active error, got %v", err)

		close(unblock)
	}))
}
