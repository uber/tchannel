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
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"golang.org/x/net/context"
)

type channelState struct {
	ch      *Channel
	closeCh chan struct{}
	closed  bool
}

func makeCall(ch *Channel, hostPort, service string) error {
	ctx, _ := context.WithTimeout(context.Background(), time.Second)
	_, _, _, err := sendRecv(ctx, ch, hostPort, service, "test", nil, nil)
	return err
}

// TestClose ensures that once a Channel is closed, it cannot be reached.
func TestClose(t *testing.T) {
	if testing.Short() {
		return
	}

	const numHandlers = 5
	handler := &swapper{t}
	var lock sync.RWMutex
	var channels []*channelState

	// Start numHandlers servers, and don't close the connections till they are signalled.
	for i := 0; i < numHandlers; i++ {
		go func() {
			assert.NoError(t, withServerChannel(nil, func(ch *Channel, hostPort string) {
				ch.Register(AsRaw(handler), "test")

				chState := &channelState{
					ch:      ch,
					closeCh: make(chan struct{}),
				}

				lock.Lock()
				channels = append(channels, chState)
				lock.Unlock()

				// Wait for a close signal.
				<-chState.closeCh

				// Lock until the connection is closed.
				lock.Lock()
				chState.closed = true
			}))
			lock.Unlock()
		}()
	}

	time.Sleep(time.Millisecond * 100)

	// Start goroutines to make calls until the test has ended.
	testEnded := make(chan struct{})
	for i := 0; i < 10; i++ {
		go func() {
			for {
				select {
				case <-testEnded:
					return
				default:
					// Keep making requests till the test ends.
				}

				// Get 2 random channels and make a call from one to the other.
				chState1 := channels[rand.Intn(len(channels))]
				chState2 := channels[rand.Intn(len(channels))]
				if chState1 == chState2 {
					continue
				}

				// Grab a read lock to make sure channels aren't closed while we call.
				lock.RLock()
				ch1Closed := chState1.closed
				ch2Closed := chState2.closed
				err := makeCall(chState1.ch, chState2.ch.PeerInfo().HostPort, chState2.ch.PeerInfo().ServiceName)
				lock.RUnlock()
				if ch1Closed || ch2Closed {
					assert.Error(t, err, "Call from %v to %v should fail", chState1.ch.PeerInfo(), chState2.ch.PeerInfo())
				} else {
					assert.NoError(t, err)
				}
			}
		}()
	}

	// Kill connections till all of the connections are dead.
	for i := 0; i < numHandlers; i++ {
		time.Sleep(time.Duration(rand.Intn(50)) * time.Millisecond)
		channels[i].closeCh <- struct{}{}
	}
}
