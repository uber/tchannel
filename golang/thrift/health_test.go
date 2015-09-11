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

package thrift

import (
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
)

func TestDefaultHealth(t *testing.T) {
	withMetaSetup(t, func(ctx Context, c tchanMeta, server *Server) {
		ret, err := c.Health(ctx)
		if assert.NoError(t, err, "Health endpoint failed") {
			assert.True(t, ret.Ok, "Health status mismatch")
			assert.Nil(t, ret.Message, "Health message mismatch")
		}
	})
}

func customHealth(ctx Context) (bool, string) {
	return false, ""
}

func TestCustomHealth(t *testing.T) {
	withMetaSetup(t, func(ctx Context, c tchanMeta, server *Server) {
		server.RegisterHealthHandler(customHealth)
		ret, err := c.Health(ctx)
		if assert.NoError(t, err, "Health endpoint failed") {
			assert.False(t, ret.Ok, "Health status mismatch")
			assert.Nil(t, ret.Message, "Health message mismatch")
		}
	})
}

func withMetaSetup(t *testing.T, f func(ctx Context, c tchanMeta, server *Server)) {
	ctx, cancel := NewContext(time.Second * 10)
	defer cancel()

	// Start server
	tchan, listener, server, err := setupMetaServer()
	require.NoError(t, err)
	defer tchan.Close()

	// Get client1
	c, err := getMetaClient(listener.Addr().String())
	require.NoError(t, err)
	f(ctx, c, server)
}

func setupMetaServer() (*tchannel.Channel, net.Listener, *Server, error) {
	tchan, err := tchannel.NewChannel("meta", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, nil, nil, err
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, nil, nil, err
	}

	server := NewServer(tchan)
	tchan.Serve(listener)
	return tchan, listener, server, nil
}

func getMetaClient(dst string) (tchanMeta, error) {
	tchan, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, err
	}

	tchan.Peers().Add(dst)
	thriftClient := NewClient(tchan, "meta", nil)
	return newTChanMetaClient(thriftClient), nil
}
