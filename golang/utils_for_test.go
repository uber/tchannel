package tchannel

// This file contains functions for tests to access internal tchannel state.
// Since it has a _test.go suffix, it is only compiled with tests in this package.

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
	"net"
	"time"
)

// OutboundConnection returns the underlying connection for an outbound call.
func OutboundConnection(call *OutboundCall) (*Connection, net.Conn) {
	conn := call.conn
	return conn, conn.conn
}

// GetConnections returns all connections for a channel.
func GetConnections(ch *Channel) []*Connection {
	var connections []*Connection
	for _, p := range ch.peers.peers {
		for _, c := range p.connections {
			connections = append(connections, c)
		}
	}
	return connections
}

// GetTimeNow returns the variable pointing to time.Now for stubbing.
func GetTimeNow() *func() time.Time {
	return &timeNow
}
