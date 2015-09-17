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
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/net/context"
)

var (
	errAlreadyListening  = errors.New("channel already listening")
	errInvalidStateForOp = errors.New("channel is in an invalid state for that operation")

	// ErrNoServiceName is returned when no service name is provided when
	// creating a new channel.
	ErrNoServiceName = errors.New("no service name provided")
)

const (
	ephemeralHostPort = "0.0.0.0:0"
)

// TraceReporterFactory is the interface of the method to generate TraceReporter instance.
type TraceReporterFactory func(*Channel) TraceReporter

// ChannelOptions are used to control parameters on a create a TChannel
type ChannelOptions struct {
	// Default Connection options
	DefaultConnectionOptions ConnectionOptions

	// The name of the process, for logging and reporting to peers
	ProcessName string

	// The logger to use for this channel
	Logger Logger

	// The reporter to use for reporting stats for this channel.
	StatsReporter StatsReporter

	// Trace reporter to use for this channel.
	TraceReporter TraceReporter

	// Trace reporter factory to generate trace reporter instance.
	TraceReporterFactory TraceReporterFactory
}

// ChannelState is the state of a channel.
type ChannelState int

const (
	// ChannelClient is a channel that can be used as a client.
	ChannelClient ChannelState = iota + 1

	// ChannelListening is a channel that is listening for new connnections.
	ChannelListening

	// ChannelStartClose is a channel that has received a Close request.
	// The channel is no longer listening, and all new incoming connections are rejected.
	ChannelStartClose

	// ChannelInboundClosed is a channel that has drained all incoming connections, but may
	// have outgoing connections. All incoming calls and new outgoing calls are rejected.
	ChannelInboundClosed

	// ChannelClosed is a channel that has closed completely.
	ChannelClosed
)

//go:generate stringer -type=ChannelState

// A Channel is a bi-directional connection to the peering and routing network.
// Applications can use a Channel to make service calls to remote peers via
// BeginCall, or to listen for incoming calls from peers.  Applications that
// want to receive requests should call one of Serve or ListenAndServe
// TODO(prashant): Shutdown all subchannels + peers when channel is closed.
type Channel struct {
	log                  Logger
	commonStatsTags      map[string]string
	statsReporter        StatsReporter
	traceReporter        TraceReporter
	traceReporterFactory TraceReporterFactory
	connectionOptions    ConnectionOptions
	handlers             *handlerMap
	peers                *PeerList
	subChannels          *subChannelMap

	// mutable contains all the members of Channel which are mutable.
	mutable struct {
		mut      sync.RWMutex // protects members of the mutable struct.
		state    ChannelState
		peerInfo LocalPeerInfo // May be ephemeral if this is a client only channel
		l        net.Listener  // May be nil if this is a client only channel
		conns    []*Connection
	}
}

// NewChannel creates a new Channel.  The new channel can be used to send outbound requests
// to peers, but will not listen or handling incoming requests until one of ListenAndServe
// or Serve is called. The local service name should be passed to serviceName.
func NewChannel(serviceName string, opts *ChannelOptions) (*Channel, error) {
	if serviceName == "" {
		return nil, ErrNoServiceName
	}

	if opts == nil {
		opts = &ChannelOptions{}
	}

	logger := opts.Logger
	if logger == nil {
		logger = NullLogger
	}

	processName := opts.ProcessName
	if processName == "" {
		processName = fmt.Sprintf("%s[%d]", filepath.Base(os.Args[0]), os.Getpid())
	}

	statsReporter := opts.StatsReporter
	if statsReporter == nil {
		statsReporter = NullStatsReporter
	}

	ch := &Channel{
		connectionOptions: opts.DefaultConnectionOptions,
		log:               logger.WithFields(LogField{"service", serviceName}),
		statsReporter:     statsReporter,
		handlers:          &handlerMap{},
		subChannels:       &subChannelMap{},
	}

	traceReporter := opts.TraceReporter
	if opts.TraceReporterFactory != nil {
		traceReporter = opts.TraceReporterFactory(ch)
	}
	if traceReporter == nil {
		traceReporter = NullReporter
	}
	ch.traceReporter = traceReporter

	ch.mutable.peerInfo = LocalPeerInfo{
		PeerInfo: PeerInfo{
			ProcessName: processName,
			HostPort:    ephemeralHostPort,
		},
		ServiceName: serviceName,
	}
	ch.mutable.state = ChannelClient
	ch.peers = newPeerList(ch)
	ch.createCommonStats()
	return ch, nil
}

// Serve serves incoming requests using the provided listener.
// The local peer info is set synchronously, but the actual socket listening is done in
// a separate goroutine.
func (ch *Channel) Serve(l net.Listener) error {
	mutable := &ch.mutable
	mutable.mut.Lock()
	defer mutable.mut.Unlock()

	if mutable.l != nil {
		return errAlreadyListening
	}
	mutable.l = l

	if mutable.state != ChannelClient {
		return errInvalidStateForOp
	}
	mutable.state = ChannelListening

	mutable.peerInfo.HostPort = l.Addr().String()
	peerInfo := mutable.peerInfo
	ch.log.Debugf("%v (%v) listening on %v", peerInfo.ProcessName, peerInfo.ServiceName, peerInfo.HostPort)
	go ch.serve()
	return nil
}

// ListenAndServe listens on the given address and serves incoming requests.
// The port may be 0, in which case the channel will use an OS assigned port
// This method does not block as the handling of connections is done in a goroutine.
func (ch *Channel) ListenAndServe(hostPort string) error {
	mutable := &ch.mutable
	mutable.mut.RLock()

	if mutable.l != nil {
		mutable.mut.RUnlock()
		return errAlreadyListening
	}

	l, err := net.Listen("tcp", hostPort)
	if err != nil {
		mutable.mut.RUnlock()
		return err
	}

	mutable.mut.RUnlock()
	return ch.Serve(l)
}

// Registrar is the base interface for registering handlers on either the base
// Channel or the SubChannel
type Registrar interface {
	// ServiceName returns the service name that this Registrar is for.
	ServiceName() string

	// Register registers a handler for ServiceName and the given operation.
	Register(h Handler, operationName string)

	// Logger returns the logger for this Registrar.
	Logger() Logger

	// StatsReporter returns the stats reporter for this Registrar
	StatsReporter() StatsReporter

	// StatsTags returns the tags that should be used.
	StatsTags() map[string]string

	// Peers returns the peer list for this Registrar.
	Peers() *PeerList
}

// Register registers a handler for a service+operation pair
func (ch *Channel) Register(h Handler, operationName string) {
	ch.handlers.register(h, ch.PeerInfo().ServiceName, operationName)
}

// PeerInfo returns the current peer info for the channel
func (ch *Channel) PeerInfo() LocalPeerInfo {
	ch.mutable.mut.RLock()
	peerInfo := ch.mutable.peerInfo
	ch.mutable.mut.RUnlock()

	return peerInfo
}

func (ch *Channel) createCommonStats() {
	ch.commonStatsTags = map[string]string{
		"app":     ch.mutable.peerInfo.ProcessName,
		"service": ch.mutable.peerInfo.ServiceName,
	}
	host, err := os.Hostname()
	if err != nil {
		ch.log.Infof("channel failed to get host: %v", err)
		return
	}
	ch.commonStatsTags["host"] = host
	// TODO(prashant): Allow user to pass extra tags (such as cluster, version).
}

// GetSubChannel returns a SubChannel for the given service name. If the subchannel does not
// exist, it is created.
func (ch *Channel) GetSubChannel(serviceName string) *SubChannel {
	return ch.subChannels.getOrAdd(serviceName, ch)
}

// Peers returns the PeerList for the channel.
func (ch *Channel) Peers() *PeerList {
	return ch.peers
}

// BeginCall starts a new call to a remote peer, returning an OutboundCall that can
// be used to write the arguments of the call.
func (ch *Channel) BeginCall(ctx context.Context, hostPort, serviceName, operationName string, callOptions *CallOptions) (*OutboundCall, error) {
	p := ch.peers.GetOrAdd(hostPort)
	return p.BeginCall(ctx, serviceName, operationName, callOptions)
}

// serve runs the listener to accept and manage new incoming connections, blocking
// until the channel is closed.
func (ch *Channel) serve() {
	acceptBackoff := 0 * time.Millisecond

	for {
		netConn, err := ch.mutable.l.Accept()
		if err != nil {
			// Backoff from new accepts if this is a temporary error
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				if acceptBackoff == 0 {
					acceptBackoff = 5 * time.Millisecond
				} else {
					acceptBackoff *= 2
				}
				if max := 1 * time.Second; acceptBackoff > max {
					acceptBackoff = max
				}
				ch.log.Warnf("accept error: %v; retrying in %v", err, acceptBackoff)
				time.Sleep(acceptBackoff)
				continue
			} else {
				// Only log an error if this didn't happen due to a Close.
				if ch.State() >= ChannelStartClose {
					return
				}
				ch.log.Fatalf("unrecoverable accept error: %v; closing server", err)
				return
			}
		}

		acceptBackoff = 0

		// Register the connection in the peer once the channel is set up.
		events := connectionEvents{
			OnActive:           ch.incomingConnectionActive,
			OnCloseStateChange: ch.connectionCloseStateChange,
		}
		if _, err := ch.newInboundConnection(netConn, events, &ch.connectionOptions); err != nil {
			// Server is getting overloaded - begin rejecting new connections
			ch.log.Errorf("could not create new TChannelConnection for incoming conn: %v", err)
			netConn.Close()
			continue
		}
	}
}

// Ping sends a ping message to the given hostPort and waits for a response.
func (ch *Channel) Ping(ctx context.Context, hostPort string) error {
	peer := ch.Peers().GetOrAdd(hostPort)
	conn, err := peer.GetConnection(ctx)
	if err != nil {
		return err
	}

	return conn.ping(ctx)
}

// Logger returns the logger for this channel.
func (ch *Channel) Logger() Logger {
	return ch.log
}

// StatsReporter returns the stats reporter for this channel.
func (ch *Channel) StatsReporter() StatsReporter {
	return ch.statsReporter
}

// StatsTags returns the common tags that should be used when reporting stats.
// It returns a new map for each call.
func (ch *Channel) StatsTags() map[string]string {
	m := make(map[string]string)
	for k, v := range ch.commonStatsTags {
		m[k] = v
	}
	return m
}

// ServiceName returns the serviceName that this channel was created for.
func (ch *Channel) ServiceName() string {
	return ch.PeerInfo().ServiceName
}

// Connect connects the channel.
func (ch *Channel) Connect(ctx context.Context, hostPort string, connectionOptions *ConnectionOptions) (*Connection, error) {
	switch state := ch.State(); state {
	case ChannelClient, ChannelListening:
		break
	case ChannelStartClose:
		// We still allow outgoing connections during Close, but the connection has to immediately
		// be Closed after opening
	default:
		ch.log.Debugf("Connect rejecting new connection as state is %v", state)
		return nil, errInvalidStateForOp
	}

	events := connectionEvents{OnCloseStateChange: ch.connectionCloseStateChange}
	c, err := ch.newOutboundConnection(hostPort, events, connectionOptions)
	if err != nil {
		return nil, err
	}

	if err := c.sendInit(ctx); err != nil {
		return nil, err
	}

	ch.mutable.mut.Lock()
	ch.mutable.conns = append(ch.mutable.conns, c)
	chState := ch.mutable.state
	ch.mutable.mut.Unlock()

	// Any connections added after the channel is in StartClose should also be set to start close.
	if chState == ChannelStartClose {
		// TODO(prashant): If Connect is called, but no outgoing calls are made, then this connection
		// will block Close, as it will never get cleaned up.
		c.withStateLock(func() error {
			c.state = connectionStartClose
			return nil
		})
		c.log.Debugf("Channel is in start close, set connection to start close")
	}

	return c, err
}

// incomingConnectionActive adds a new active connection to our peer list.
func (ch *Channel) incomingConnectionActive(c *Connection) {
	c.log.Debugf("Add connection as an active peer for %v", c.remotePeerInfo.HostPort)
	p := ch.peers.GetOrAdd(c.remotePeerInfo.HostPort)
	p.AddConnection(c)

	ch.mutable.mut.Lock()
	ch.mutable.conns = append(ch.mutable.conns, c)
	ch.mutable.mut.Unlock()
}

// connectionCloseStateChange is called when a connection's close state changes.
func (ch *Channel) connectionCloseStateChange(c *Connection) {
	chState := ch.State()
	if chState != ChannelStartClose && chState != ChannelInboundClosed {
		return
	}

	ch.mutable.mut.RLock()
	minState := connectionClosed
	for _, c := range ch.mutable.conns {
		if s := c.readState(); s < minState {
			minState = s
		}
	}
	ch.mutable.mut.RUnlock()

	var updateTo ChannelState
	if minState >= connectionClosed {
		updateTo = ChannelClosed
	} else if minState >= connectionInboundClosed && chState == ChannelStartClose {
		updateTo = ChannelInboundClosed
	}

	if updateTo > 0 {
		ch.mutable.mut.Lock()
		ch.mutable.state = updateTo
		ch.mutable.mut.Unlock()
		chState = updateTo
	}

	c.log.Debugf("ConnectionCloseStateChange channel state = %v connection minState = %v",
		chState, minState)
}

// Closed returns whether this channel has been closed with .Close()
func (ch *Channel) Closed() bool {
	return ch.State() == ChannelClosed
}

// State returns the current channel state.
func (ch *Channel) State() ChannelState {
	ch.mutable.mut.RLock()
	state := ch.mutable.state
	ch.mutable.mut.RUnlock()

	return state
}

// Close starts a graceful Close for the channel. This does not happen immediately:
// 1. This call closes the Listener and starts closing connections.
// 2. When all incoming connections are drainged, the connection blocks new outgoing calls.
// 3. When all connections are drainged, the channel's state is updated to Closed.
func (ch *Channel) Close() {
	ch.mutable.mut.Lock()

	if ch.mutable.l != nil {
		ch.mutable.l.Close()
	}

	ch.mutable.state = ChannelStartClose
	if len(ch.mutable.conns) == 0 {
		ch.mutable.state = ChannelClosed
	}
	ch.mutable.mut.Unlock()

	ch.peers.Close()
}
