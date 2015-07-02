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
	"bytes"
	"fmt"
	"math/rand"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

type swapper struct {
	t *testing.T
}

func (s *swapper) OnError(ctx context.Context, err error) {
	s.t.Errorf("OnError: %v", err)
}

func (*swapper) Handle(ctx context.Context, args *rawArgs) (*rawRes, error) {
	return &rawRes{
		Arg2: args.Arg3,
		Arg3: args.Arg2,
	}, nil
}

type recordingFramePool struct {
	mut         sync.Mutex
	allocations map[*Frame]string
	badRelease  []string
}

func newRecordingFramePool() *recordingFramePool {
	return &recordingFramePool{
		allocations: make(map[*Frame]string),
	}
}

func recordStack() string {
	buf := make([]byte, 4096)
	runtime.Stack(buf, false)
	return string(buf)
}

func (p *recordingFramePool) Get() *Frame {
	p.mut.Lock()
	defer p.mut.Unlock()
	frame := NewFrame(MaxFramePayloadSize)
	p.allocations[frame] = recordStack()
	return frame
}

func zeroOut(bs []byte) {
	for i := range bs {
		bs[i] = 0
	}
}

func (p *recordingFramePool) Release(f *Frame) {
	// Make sure the payload is not used after this point by clearing the frame.
	zeroOut(f.Payload)
	f.Payload = nil
	zeroOut(f.buffer)
	f.buffer = nil
	zeroOut(f.headerBuffer)
	f.headerBuffer = nil
	f.Header = FrameHeader{}

	p.mut.Lock()
	defer p.mut.Unlock()

	if _, ok := p.allocations[f]; !ok {
		p.badRelease = append(p.badRelease, "bad Release at "+recordStack())
		return
	}

	delete(p.allocations, f)
}

func (p *recordingFramePool) CheckEmpty() (int, string) {
	p.mut.Lock()
	defer p.mut.Unlock()

	var badCalls []string
	badCalls = append(badCalls, p.badRelease...)
	for f, s := range p.allocations {
		badCalls = append(badCalls, fmt.Sprintf("frame %p: %v not released, get from: %v", f, f.Header, s))
	}
	return len(p.allocations), strings.Join(badCalls, "\n")
}

func getConnections(ch *Channel) []*Connection {
	var connections []*Connection
	for _, p := range ch.peers.peers {
		for _, c := range p.connections {
			connections = append(connections, c)
		}
	}
	return connections
}

func checkEmptyExchanges(c *Connection) string {
	if exchangesLeft := len(c.outbound.exchanges) + len(c.inbound.exchanges); exchangesLeft > 0 {
		return fmt.Sprintf("connection %p had %v leftover exchanges", c, exchangesLeft)
	}
	return ""
}

func checkEmptyExchangesConns(connections []*Connection) string {
	var errors []string
	for _, c := range connections {
		if v := checkEmptyExchanges(c); v != "" {
			errors = append(errors, v)
		}
	}
	return strings.Join(errors, "\n")
}

func TestFramesReleased(t *testing.T) {
	if testing.Short() {
		return
	}

	testutils.SetTimeout(t, time.Second*10)
	const (
		requestsPerGoroutine = 10
		numGoroutines        = 10
		maxRandArg           = 512 * 1024
	)

	// Generate random bytes used to create arguments.
	randBytes := make([]byte, maxRandArg)
	for i := 0; i < len(randBytes); i += 8 {
		n := rand.Int63()
		for j := 0; j < 8; j++ {
			randBytes[i+j] = byte(n & 0xff)
			n = n << 1
		}
	}

	var connections []*Connection
	pool := newRecordingFramePool()
	require.NoError(t, withServerChannel(&testChannelOpts{
		ServiceName: "swap-server",
		DefaultConnectionOptions: ConnectionOptions{
			FramePool: pool,
		},
	}, func(serverCh *Channel, hostPort string) {
		serverCh.Register(AsRaw(&swapper{t}), "swap")

		clientCh, err := NewChannel("swap-client", nil)
		require.NoError(t, err)
		defer clientCh.Close()

		// Create an active connection that can be shared by the goroutines by calling Ping.
		ctx, cancel := NewContext(time.Second)
		defer cancel()
		require.NoError(t, clientCh.Ping(ctx, hostPort))

		generateArg := func(n int) []byte {
			from := rand.Intn(maxRandArg - n)
			return randBytes[from : from+n]
		}

		var wg sync.WaitGroup
		worker := func() {
			for i := 0; i < requestsPerGoroutine; i++ {
				ctx, cancel := NewContext(time.Second * 5)
				defer cancel()

				require.NoError(t, clientCh.Ping(ctx, hostPort))

				argSize := rand.Intn(maxRandArg)
				arg2 := generateArg(argSize)
				arg3 := generateArg(argSize)
				resArg2, resArg3, _, err := sendRecv(ctx, clientCh, hostPort, "swap-server", "swap", arg2, arg3)
				if !assert.NoError(t, err, "error during sendRecv") {
					continue
				}

				// We expect the arguments to be swapped.
				if bytes.Compare(arg3, resArg2) != 0 {
					t.Errorf("returned arg2 does not match expected:\n  got %v\n want %v", resArg2, arg3)
				}
				if bytes.Compare(arg2, resArg3) != 0 {
					t.Errorf("returned arg2 does not match expected:\n  got %v\n want %v", resArg3, arg2)
				}
			}
			wg.Done()
		}

		for i := 0; i < numGoroutines; i++ {
			wg.Add(1)
			go worker()
		}

		wg.Wait()

		connections = append(connections, getConnections(serverCh)...)
		connections = append(connections, getConnections(clientCh)...)
	}))

	// Wait a few milliseconds for the closing of channels to take effect.
	time.Sleep(10 * time.Millisecond)

	if unreleasedCount, isEmpty := pool.CheckEmpty(); isEmpty != "" || unreleasedCount > 0 {
		t.Errorf("Frame pool has %v unreleased frames, errors:\n%v", unreleasedCount, isEmpty)
	}

	// Check the message exchanges and make sure they are all empty.
	if exchangesLeft := checkEmptyExchangesConns(connections); exchangesLeft != "" {
		t.Errorf("Found uncleared message exchanges:\n%v", exchangesLeft)
	}
}
