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

type benchmarkHandler struct{}

func (h *benchmarkHandler) Handle(ctx context.Context, args *raw.Args) (*raw.Res, error) {
	return &raw.Res{
		Arg2: args.Arg3,
		Arg3: args.Arg2,
	}, nil
}

func (h *benchmarkHandler) OnError(ctx context.Context, err error) {
}

func setupServer(b *testing.B) (ch *Channel, svcName, svcHostPort string) {
	serverCh, err := testutils.NewServer(nil)
	require.Nil(b, err)
	handler := &benchmarkHandler{}
	serverCh.Register(raw.Wrap(handler), "echo")

	peerInfo := serverCh.PeerInfo()
	return serverCh, peerInfo.ServiceName, peerInfo.HostPort
}

func BenchmarkCallsSerial(b *testing.B) {
	serverCh, svcName, svcHostPort := setupServer(b)
	defer serverCh.Close()

	clientCh, err := testutils.NewClient(nil)
	require.NoError(b, err)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ctx, cancel := NewContext(time.Second)
		_, _, _, err = raw.Call(ctx, clientCh, svcHostPort, svcName, "echo", []byte("data111"), []byte("data222"))
		assert.NoError(b, err)
		cancel()
	}
}

func BenchmarkCallsConcurrent(b *testing.B) {
	const numWorkers = 5

	serverCh, svcName, svcHostPort := setupServer(b)
	defer serverCh.Close()

	var wg sync.WaitGroup
	inCh := make(chan struct{})
	for i := 0; i < numWorkers; i++ {
		go func() {
			clientCh, err := testutils.NewClient(nil)
			require.NoError(b, err)
			defer clientCh.Close()

			for range inCh {
				ctx, cancel := NewContext(time.Second)

				_, _, _, err = raw.Call(ctx, clientCh, svcHostPort, svcName, "echo", []byte("data111"), []byte("data222"))
				assert.NoError(b, err)

				cancel()
				wg.Done()
			}
		}()
	}

	for i := 0; i < b.N; i++ {
		wg.Add(1)
		inCh <- struct{}{}
	}

	wg.Wait()
	close(inCh)
}
