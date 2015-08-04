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
	"math/rand"
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

type channelState struct {
	ch      *Channel
	closeCh chan struct{}
	closed  bool
}

func makeCall(ch *Channel, hostPort, service string) error {
	ctx, cancel := NewContext(time.Second)
	defer cancel()

	_, _, _, err := raw.Call(ctx, ch, hostPort, service, "test", nil, nil)
	return err
}

// TestCloseStress ensures that once a Channel is closed, it cannot be reached.
func TestCloseStress(t *testing.T) {
	CheckStress(t)

	const numHandlers = 5
	handler := &swapper{t}
	var lock sync.RWMutex
	var wg sync.WaitGroup
	var channels []*channelState

	// Start numHandlers servers, and don't close the connections till they are signalled.
	for i := 0; i < numHandlers; i++ {
		wg.Add(1)
		go func() {
			assert.NoError(t, testutils.WithServer(nil, func(ch *Channel, hostPort string) {
				ch.Register(raw.Wrap(handler), "test")

				chState := &channelState{
					ch:      ch,
					closeCh: make(chan struct{}),
				}

				lock.Lock()
				channels = append(channels, chState)
				lock.Unlock()
				wg.Done()

				// Wait for a close signal.
				<-chState.closeCh

				// Lock until the connection is closed.
				lock.Lock()
				chState.closed = true
			}))
			lock.Unlock()
		}()
	}

	// Wait till all the channels have been registered.
	wg.Wait()

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
				lock.RLock()
				chState1 := channels[rand.Intn(len(channels))]
				chState2 := channels[rand.Intn(len(channels))]
				if chState1 == chState2 {
					lock.RUnlock()
					continue
				}

				// Grab a read lock to make sure channels aren't closed while we call.
				ch1Closed := chState1.closed
				ch2Closed := chState2.closed
				err := makeCall(chState1.ch, chState2.ch.PeerInfo().HostPort, chState2.ch.PeerInfo().ServiceName)
				lock.RUnlock()
				if ch1Closed || ch2Closed {
					assert.Error(t, err, "Call from %v to %v should fail", chState1.ch.PeerInfo(), chState2.ch.PeerInfo())
				} else {
					assert.NoError(t, err, "Call from %v to %v should not fail", chState1.ch.PeerInfo(), chState2.ch.PeerInfo())
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

type rawFuncHandler func(context.Context, *raw.Args) (*raw.Res, error)

func (f rawFuncHandler) OnError(_ context.Context, _ error) {}
func (f rawFuncHandler) Handle(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	return f(ctx, args)
}

func registerFunc(ch *Channel, name string,
	f func(ctx context.Context, args *raw.Args) (*raw.Res, error)) {

	ch.Register(raw.Wrap(rawFuncHandler(f)), name)
}

func TestCloseSemantics(t *testing.T) {
	defer testutils.SetTimeout(t, 2*time.Second)()
	ctx, cancel := NewContext(time.Second)
	defer cancel()

	makeServer := func(name string) (*Channel, chan struct{}) {
		ch, err := testutils.NewServer(&testutils.ChannelOpts{ServiceName: name})
		require.NoError(t, err)
		c := make(chan struct{})
		registerFunc(ch, "stream", func(ctx context.Context, args *raw.Args) (*raw.Res, error) {
			<-c
			return &raw.Res{}, nil
		})
		registerFunc(ch, "call", func(ctx context.Context, args *raw.Args) (*raw.Res, error) {
			return &raw.Res{}, nil
		})
		return ch, c
	}

	newClient := func() *Channel {
		ch, err := testutils.NewClient(&testutils.ChannelOpts{ServiceName: "client"})
		require.NoError(t, err)
		return ch
	}

	call := func(from *Channel, to *Channel) error {
		toPeer := to.PeerInfo()
		_, _, _, err := raw.Call(ctx, from, toPeer.HostPort, toPeer.ServiceName, "call", nil, nil)
		return err
	}

	callStream := func(from *Channel, to *Channel) <-chan struct{} {
		c := make(chan struct{})

		toPeer := to.PeerInfo()
		call, err := from.BeginCall(ctx, toPeer.HostPort, toPeer.ServiceName, "stream", nil)
		require.NoError(t, err)
		require.NoError(t, NewArgWriter(call.Arg2Writer()).Write(nil), "write arg2")
		require.NoError(t, NewArgWriter(call.Arg3Writer()).Write(nil), "write arg3")

		go func() {
			var d []byte
			require.NoError(t, NewArgReader(call.Response().Arg2Reader()).Read(&d), "read arg2 from %v to %v", from.PeerInfo(), to.PeerInfo())
			require.NoError(t, NewArgReader(call.Response().Arg3Reader()).Read(&d), "read arg3")
			c <- struct{}{}
		}()

		return c
	}

	s1, s1C := makeServer("s1")
	s2, s2C := makeServer("s2")

	// Make a call from s1 -> s2, and s2 -> s1
	call1 := callStream(s1, s2)
	call2 := callStream(s2, s1)

	// s1 and s2 are both open, so calls to it should be successful.
	require.NoError(t, call(newClient(), s1))
	require.NoError(t, call(newClient(), s2))
	require.NoError(t, call(s1, s2))
	require.NoError(t, call(s2, s1))

	// Close s1, should no longer be able to call it.
	s1.Close()
	assert.Equal(t, ChannelStartClose, s1.State())
	assert.Error(t, call(newClient(), s1), "closed channel should not accept incoming calls")
	require.NoError(t, call(newClient(), s2))

	// Even an existing connection (e.g. from s2) should fail.
	assert.Equal(t, ErrChannelClosed, call(s2, s1), "closed channel should not accept incoming calls")

	require.NoError(t, call(s1, s2),
		"closed channel with pending incoming calls should allow outgoing calls")

	// Once the incoming connection is drained, outgoing calls should fail.
	s1C <- struct{}{}
	<-call2
	assert.Equal(t, ChannelInboundClosed, s1.State())
	require.Error(t, call(s1, s2),
		"closed channel with no pending incoming calls should not allow outgoing calls")

	// Now the channel should be completely closed as there are no pending connections.
	s2C <- struct{}{}
	<-call1
	assert.Equal(t, ChannelClosed, s1.State())
}

func TestCloseGoroutines(t *testing.T) {
	// Make sure that all client and server Goroutines are closed when a connection is closed.

}
