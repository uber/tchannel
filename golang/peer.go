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

package tchannel

import (
	"errors"
	"sync"
	"time"

	"golang.org/x/net/context"
)

var (
	// ErrInvalidConnectionState indicates that the connection is not in a valid state.
	ErrInvalidConnectionState = errors.New("connection is in an invalid state")

	peerRng = NewRand(time.Now().UnixNano())
)

// PeerList maintains a list of Peers.
type PeerList struct {
	channel *Channel

	mut             sync.RWMutex // mut protects peers.
	peersByHostPort map[string]*Peer
	peers           []*Peer
}

func newPeerList(channel *Channel) *PeerList {
	return &PeerList{
		channel:         channel,
		peersByHostPort: make(map[string]*Peer),
	}
}

// Add adds a peer to the list if it does not exist, or returns any existing peer.
func (l *PeerList) Add(hostPort string) *Peer {
	l.mut.Lock()
	defer l.mut.Unlock()

	if p, ok := l.peersByHostPort[hostPort]; ok {
		return p
	}

	p := newPeer(l.channel, hostPort)
	l.peersByHostPort[hostPort] = p
	l.peers = append(l.peers, p)
	return p
}

func randPeer(peers []*Peer) *Peer {
	return peers[peerRng.Intn(len(peers))]
}

// Get returns a peer from the peer list, or nil if none can be found.
func (l *PeerList) Get() *Peer {
	l.mut.RLock()
	defer l.mut.RUnlock()

	if len(l.peers) == 0 {
		return nil
	}

	return randPeer(l.peers)
}

// GetOrAdd returns a peer for the given hostPort, creating one if it doesn't yet exist.
func (l *PeerList) GetOrAdd(hostPort string) *Peer {
	l.mut.RLock()
	if p, ok := l.peersByHostPort[hostPort]; ok {
		l.mut.RUnlock()
		return p
	}

	l.mut.RUnlock()
	return l.Add(hostPort)
}

// Copy returns a copy of the peer list. This method should only be used for testing.
func (l *PeerList) Copy() map[string]*Peer {
	l.mut.RLock()
	defer l.mut.RUnlock()

	listCopy := make(map[string]*Peer)
	for k, v := range l.peersByHostPort {
		listCopy[k] = v
	}
	return listCopy
}

// Close closes connections for all peers.
func (l *PeerList) Close() {
	l.mut.RLock()
	defer l.mut.RUnlock()

	for _, p := range l.peers {
		p.Close()
	}
}

// Peer represents a single autobahn service or client with a unique host:port.
type Peer struct {
	channel  *Channel
	hostPort string

	mut         sync.RWMutex // mut protects connections.
	connections []*Connection
}

func newPeer(channel *Channel, hostPort string) *Peer {
	return &Peer{
		channel:  channel,
		hostPort: hostPort,
	}
}

// HostPort returns the host:port used to connect to this peer.
func (p *Peer) HostPort() string {
	return p.hostPort
}

// getActive returns a list of active connections.
// TODO(prashant): Should we clear inactive connections?
func (p *Peer) getActive() []*Connection {
	p.mut.RLock()
	defer p.mut.RUnlock()

	var active []*Connection
	for _, c := range p.connections {
		if c.IsActive() {
			active = append(active, c)
		}
	}
	return active
}

func randConn(conns []*Connection) *Connection {
	return conns[peerRng.Intn(len(conns))]
}

// GetConnection returns an active connection to this peer. If no active connections
// are found, it will create a new outbound connection and return it.
func (p *Peer) GetConnection(ctx context.Context) (*Connection, error) {
	// TODO(prashant): Use some sort of scoring to pick a connection.
	if activeConns := p.getActive(); len(activeConns) > 0 {
		return randConn(activeConns), nil
	}

	// No active connections, make a new outgoing connection.
	c, err := p.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// AddConnection adds an active connection to the peer's connection list.
// If a connection is not active, ErrInvalidConnectionState will be returned.
func (p *Peer) AddConnection(c *Connection) error {
	switch c.readState() {
	case connectionActive, connectionStartClose:
		break
	default:
		return ErrInvalidConnectionState
	}

	p.mut.Lock()
	defer p.mut.Unlock()

	p.connections = append(p.connections, c)
	return nil
}

// Connect adds a new outbound connection to the peer.
func (p *Peer) Connect(ctx context.Context) (*Connection, error) {
	c, err := p.channel.Connect(ctx, p.hostPort, &p.channel.connectionOptions)
	if err != nil {
		return nil, err
	}

	if err := p.AddConnection(c); err != nil {
		return nil, err
	}

	return c, nil
}

// BeginCall starts a new call to this specific peer, returning an OutboundCall that can
// be used to write the arguments of the call.
func (p *Peer) BeginCall(ctx context.Context, serviceName string, operationName string, callOptions *CallOptions) (*OutboundCall, error) {
	conn, err := p.GetConnection(ctx)
	if err != nil {
		return nil, err
	}

	if callOptions == nil {
		callOptions = defaultCallOptions
	}
	call, err := conn.beginCall(ctx, serviceName, callOptions, operationName)
	if err != nil {
		return nil, err
	}

	if err := call.writeOperation([]byte(operationName)); err != nil {
		return nil, err
	}

	return call, err
}

// Close closes all connections to this peer.
func (p *Peer) Close() {
	p.mut.RLock()
	defer p.mut.RUnlock()

	for _, c := range p.connections {
		c.Close()
	}
}
