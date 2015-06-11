package tchannel

import (
	"errors"
	"sync"

	"golang.org/x/net/context"
)

// ErrInvalidConnectionState indicates that the connection is not in a valid state.
var ErrInvalidConnectionState = errors.New("connection is in an invalid state")

// PeerList maintains a list of Peers.
type PeerList struct {
	channel *Channel

	mut   sync.RWMutex // mut protects peers.
	peers map[string]*Peer
}

func newPeerList(channel *Channel) *PeerList {
	return &PeerList{
		channel: channel,
		peers:   make(map[string]*Peer),
	}
}

// Add adds a peer to the list if it does not exist, or returns any existing peer.
func (l *PeerList) Add(hostPort string) *Peer {
	l.mut.Lock()
	defer l.mut.Unlock()

	if p, ok := l.peers[hostPort]; ok {
		return p
	}

	p := newPeer(l.channel, hostPort)
	l.peers[hostPort] = p
	return p
}

// Get returns a peer from the peer list, or nil if none can be found.
func (l *PeerList) Get() *Peer {
	l.mut.RLock()
	defer l.mut.RUnlock()

	for _, p := range l.peers {
		// TODO(prashant): Actually use random, not just return the first peer.
		return p
	}
	return nil
}

// GetOrAdd returns a peer for the given hostPort, creating one if it doesn't yet exist.
func (l *PeerList) GetOrAdd(hostPort string) *Peer {
	l.mut.RLock()
	if p, ok := l.peers[hostPort]; ok {
		l.mut.RUnlock()
		return p
	}

	l.mut.RUnlock()
	return l.Add(hostPort)
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

// cleanStale cleans up any stale (e.g. dead) connections.
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

// GetConnection returns an active connection to this peer. If no active connections
// are found, it will create a new outbound connection and return it.
func (p *Peer) GetConnection(ctx context.Context) (*Connection, error) {
	// TODO(prashant): Should we clear inactive connections.
	activeConns := p.getActive()

	// TODO(prashant): Use some sort of scoring to pick a connection.
	if len(activeConns) > 0 {
		return activeConns[0], nil
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
	if !c.IsActive() {
		return ErrInvalidConnectionState
	}

	p.mut.Lock()
	defer p.mut.Unlock()

	p.connections = append(p.connections, c)
	return nil
}

// Connect adds a new outbound connection to the peer.
func (p *Peer) Connect(ctx context.Context) (*Connection, error) {
	ch := p.channel
	c, err := newOutboundConnection(p.hostPort, ch.handlers, ch.log, ch.PeerInfo(), &ch.connectionOptions)
	if err != nil {
		return nil, err
	}

	if err := c.sendInit(ctx); err != nil {
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

	call, err := conn.beginCall(ctx, serviceName, callOptions)
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
		c.closeNetwork()
	}
}
