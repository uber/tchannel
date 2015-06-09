package tchannel

import "golang.org/x/net/context"

// PeerList maintains a list of Peers.
type PeerList struct {
	channel *Channel
	peers   map[string]*Peer
}

func newPeerList(channel *Channel) *PeerList {
	return &PeerList{
		channel: channel,
		peers:   make(map[string]*Peer),
	}
}

// Add a peer to the peer list.
func (l *PeerList) Add(hostPort string) *Peer {
	p := newPeer(l.channel, hostPort)
	l.peers[hostPort] = p
	return p
}

// Get returns a randomly selected peer.
func (l *PeerList) Get() *Peer {
	// return a random peer?
	for _, p := range l.peers {
		return p
	}
	return nil
}

// GetOrAdd returns a peer for the given hostPort, or creates a new peer.
func (l *PeerList) GetOrAdd(hostPort string) *Peer {
	if p, ok := l.peers[hostPort]; ok {
		return p
	}
	return l.Add(hostPort)
}

// Close closes connections for all peers.
func (l *PeerList) Close() {
	for _, p := range l.peers {
		p.Close()
	}
}

// Peer represents a single autobahn service or client with a unique host:port.
type Peer struct {
	channel     *Channel
	hostPort    string
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
func (p *Peer) cleanStale() {
	var active []*Connection
	for _, c := range p.connections {
		if c.IsActive() {
			active = append(active, c)
		}
	}
	p.connections = active
}

// GetConnection returns an active connection to this peer.
func (p *Peer) GetConnection(ctx context.Context) (*Connection, error) {
	p.cleanStale()

	// TODO(prashant): Use some sort of scoring to pick a connection.
	if len(p.connections) > 0 {
		return p.connections[0], nil
	}

	// No active connections, make a new outgoing connection.
	c, err := p.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// AddConnection TODO
func (p *Peer) AddConnection(c *Connection) {
	p.connections = append(p.connections, c)
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

	p.connections = append(p.connections, c)
	return c, nil
}

// Close closes all connections to this peer.
func (p *Peer) Close() {
	for _, c := range p.connections {
		c.closeNetwork()
	}
}
