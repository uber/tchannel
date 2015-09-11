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

package thrift_test

import (
	"net"
	"testing"
	"time"

	. "github.com/uber/tchannel/golang/thrift"
	"github.com/uber/tchannel/golang/thrift/gen-go/meta"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
)

func TestDefaultHealth(t *testing.T) {
	withMetaSetup(t, func(ctx Context, c TChanMeta) {
		ret, err := c.Health(ctx)
		assert.Equal(t, ret.Ok, true)
		assert.NoError(t, err)
		assert.Nil(t, ret.Message)
	}, nil)
}

func withMetaSetup(t *testing.T, f func(ctx Context, c TChanMeta), healthHandler HealthFunc) {
	ctx, cancel := NewContext(time.Second * 10)
	defer cancel()

	// Start server
	tchan, listener, err := setupMetaServer(healthHandler)
	require.NoError(t, err)
	defer tchan.Close()

	// Get client1
	c, err := getMetaClient(listener.Addr().String())
	require.NoError(t, err)
	f(ctx, c)
}

func setupMetaServer(healthHandler HealthFunc) (*tchannel.Channel, net.Listener, error) {
	tchan, err := tchannel.NewChannel("meta", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, nil, err
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, nil, err
	}

	server := NewServer(tchan)
	if healthHandler != nil {
		server.RegisterHealthHandler(healthHandler)
	}

	tchan.Serve(listener)
	return tchan, listener, nil
}

func getMetaClient(dst string) (TChanMeta, error) {
	tchan, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, err
	}

	tchan.Peers().Add(dst)
	thriftClient := NewClient(tchan, "meta", nil)
	return NewTChanMetaClient(thriftClient), nil
}

func customHealth(ctx Context) (r *meta.HealthStatus, err error) {
	message := "from me"
	return &meta.HealthStatus{Ok: false, Message: &message}, nil
}

func TestCustomHealth(t *testing.T) {
	withMetaSetup(t, func(ctx Context, c TChanMeta) {
		ret, err := c.Health(ctx)
		assert.Equal(t, ret.Ok, false)
		assert.NoError(t, err)
		assert.Equal(t, *ret.Message, "from me")
	}, customHealth)
}
