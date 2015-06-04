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
	errAlreadyListening = errors.New("channel already listening")
)

const (
	ephemeralHostPort = "0.0.0.0:0"
)

// ChannelOptions are used to control parameters on a create a TChannel
type ChannelOptions struct {
	// Default Connection options
	DefaultConnectionOptions ConnectionOptions

	// The name of the process, for logging and reporting to peers
	ProcessName string

	// The logger to use for this channel
	Logger Logger
}

// A Channel is a bi-directional connection to the peering and routing network.
// Applications can use a Channel to make service calls to remote peers via
// BeginCall, or to listen for incoming calls from peers.  Applications that
// want to receive requests should call one of Serve or ListenAndServe
type Channel struct {
	log               Logger
	connectionOptions ConnectionOptions
	handlers          *handlerMap

	mut      sync.RWMutex // protects the listener and the peer info
	peerInfo PeerInfo     // May be ephemeral if this is a client only channel
	l        net.Listener // May be nil if this is a client only channel
}

// NewChannel creates a new Channel.  The new channel can be used to send outbound requests
// to peers, but will not listen or handling incoming requests until one of ListenAndServe
// or Serve is called
func NewChannel(opts *ChannelOptions) (*Channel, error) {
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

	ch := &Channel{
		connectionOptions: opts.DefaultConnectionOptions,
		peerInfo: PeerInfo{
			ProcessName: processName,
			HostPort:    ephemeralHostPort,
		},
		log:      logger,
		handlers: &handlerMap{},
	}

	ch.connectionOptions.ChecksumType = ChecksumTypeCrc32
	return ch, nil
}

// Serve serves incoming requests using the provided listener
func (ch *Channel) Serve(l net.Listener) error {
	ch.mut.Lock()

	if ch.l != nil {
		ch.mut.Unlock()
		return errAlreadyListening
	}

	ch.l = l
	ch.peerInfo.HostPort = ch.l.Addr().String()
	ch.mut.Unlock()

	return ch.serve()
}

// ListenAndServe listens on the given address and serves incoming requests.
// The port may be 0, in which case the channel will use an OS assigned port
func (ch *Channel) ListenAndServe(hostPort string) error {
	if err := ch.listen(hostPort); err != nil {
		return err
	}

	return ch.serve()
}

// listen listens on the given address but does not begin serving request.
func (ch *Channel) listen(hostPort string) error {
	ch.mut.Lock()
	defer ch.mut.Unlock()

	if ch.l != nil {
		return errAlreadyListening
	}

	addr, err := net.ResolveTCPAddr("tcp", hostPort)
	if err != nil {
		ch.log.Errorf("Could not resolve network %s: %v", hostPort, err)
		return err
	}

	ch.l, err = net.ListenTCP("tcp", addr)
	if err != nil {
		ch.log.Errorf("Could not listen on %s: %v", hostPort, err)
		return err
	}

	ch.peerInfo.HostPort = ch.l.Addr().String()
	ch.log.Infof("%s listening on %s", ch.peerInfo.ProcessName, ch.peerInfo.HostPort)
	return nil
}

// Register registers a handler for a service+operation pair
func (ch *Channel) Register(h Handler, serviceName, operationName string) {
	ch.handlers.register(h, serviceName, operationName)
}

// PeerInfo returns the current peer info for the channel
func (ch *Channel) PeerInfo() PeerInfo {
	ch.mut.RLock()
	defer ch.mut.RUnlock()

	return ch.peerInfo
}

// BeginCall starts a new call to a remote peer, returning an OutboundCall that can
// be used to write the arguments of the call
// TODO(mmihic): Support CallOptions such as format, request specific checksums, retries, etc
func (ch *Channel) BeginCall(ctx context.Context, hostPort, serviceName, operationName string, callOptions *CallOptions) (*OutboundCall, error) {
	// TODO(mmihic): Keep-alive, manage pools, use existing inbound if possible, all that jazz
	nconn, err := net.Dial("tcp", hostPort)
	if err != nil {
		return nil, err
	}

	conn, err := newOutboundConnection(nconn, ch.handlers, ch.log, ch.PeerInfo(), &ch.connectionOptions)
	if err != nil {
		return nil, err
	}

	if err := conn.sendInit(ctx); err != nil {
		return nil, err
	}

	call, err := conn.beginCall(ctx, serviceName, callOptions)
	if err != nil {
		return nil, err
	}

	if err := call.writeOperation([]byte(operationName)); err != nil {
		return nil, err
	}

	return call, nil
}

// serve runs the listener to accept and manage new incoming connections, blocking
// until the channel is closed.
func (ch *Channel) serve() error {
	acceptBackoff := 0 * time.Millisecond

	for {
		netConn, err := ch.l.Accept()
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
				ch.log.Errorf("unrecoverable accept error: %v; closing server", err)
				return nil
			}
		}

		acceptBackoff = 0

		_, err = newInboundConnection(netConn, ch.handlers, ch.PeerInfo(), ch.log, &ch.connectionOptions)
		if err != nil {
			// Server is getting overloaded - begin rejecting new connections
			ch.log.Errorf("could not create new TChannelConnection for incoming conn: %v", err)
			netConn.Close()
			continue
		}

		// TODO(mmihic): Register connection so we can close them when the channel is closed
	}
}
