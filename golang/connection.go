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
	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
	"net"
	"sync"
	"sync/atomic"
)

// PeerInfo contains nformation about a TChannel peer
type PeerInfo struct {
	// The host and port that can be used to contact the peer, as encoded by net.JoinHostPort
	HostPort string

	// The logical process name for the peer, used for only for logging / debugging
	ProcessName string
}

func (p PeerInfo) String() string {
	return fmt.Sprintf("%s(%s)", p.HostPort, p.ProcessName)
}

// CurrentProtocolVersion is the current version of the TChannel protocol supported by this stack
const CurrentProtocolVersion = 0x02

var (
	// ErrConnectionClosed is returned when a caller performs an operation on a closed connection
	ErrConnectionClosed = errors.New("connection is closed")

	// ErrConnectionNotReady is returned when a caller attempts to send a request through
	// a connection which has not yet been initialized
	ErrConnectionNotReady = errors.New("connection is not yet ready")

	// ErrSendBufferFull is returned when a message cannot be sent to the peer because
	// the frame sending buffer has become full.  Typically this indicates that the
	// connection is stuck and writes have become backed up
	ErrSendBufferFull = errors.New("connection send buffer is full, cannot send frame")

	errConnectionAlreadyActive     = errors.New("connection is already active")
	errConnectionWaitingOnPeerInit = errors.New("connection is waiting for the peer to sent init")
	errCannotHandleInitRes         = errors.New("could not return init-res to handshake thread")
)

// ConnectionOptions are options that control the behavior of a Connection
type ConnectionOptions struct {
	// The identity of the local peer
	PeerInfo PeerInfo

	// The frame pool, allowing better management of frame buffers.  Defaults to using raw heap
	FramePool FramePool

	// The size of receive channel buffers.  Defaults to 512
	RecvBufferSize int

	// The size of send channel buffers.  Defaults to 512
	SendBufferSize int

	// The type of checksum to use when sending messages
	ChecksumType ChecksumType
}

// Connection represents a connection to a remote peer.
type Connection struct {
	ch             *TChannel
	log            Logger
	checksumType   ChecksumType
	framePool      FramePool
	conn           net.Conn
	localPeerInfo  PeerInfo
	remotePeerInfo PeerInfo
	sendCh         chan *Frame
	state          connectionState
	stateMut       sync.RWMutex
	inbound        messageExchangeSet
	outbound       messageExchangeSet
	handlers       handlerMap
	nextMessageID  uint32
}

type connectionState int

const (
	// TChannelConnection initiated by peer is waiting to recv init-req from peer
	connectionWaitingToRecvInitReq connectionState = iota

	// TChannelConnection initated by current process is waiting to send init-req to peer
	connectionWaitingToSendInitReq

	// TChannelConnection initiated by current process has sent init-req, and is waiting for init-req
	connectionWaitingToRecvInitRes

	// TChannelConnection is fully active
	connectionActive

	// TChannelConnection is starting to close; new incoming requests are rejected, outbound
	// requests are allowed to proceed
	connectionStartClose

	// TChannelConnection has finished processing all active inbound, and is waiting for outbound
	// requests to complete or timeout
	connectionInboundClosed

	// TChannelConnection is fully closed
	connectionClosed
)

// Creates a new TChannelConnection around an outbound connection initiated to a peer
func newOutboundConnection(ch *TChannel, conn net.Conn,
	opts *ConnectionOptions) (*Connection, error) {
	c := newConnection(ch, conn, connectionWaitingToSendInitReq, opts)
	return c, nil
}

// Creates a new TChannelConnection based on an incoming connection from a peer
func newInboundConnection(ch *TChannel, conn net.Conn,
	opts *ConnectionOptions) (*Connection, error) {
	c := newConnection(ch, conn, connectionWaitingToRecvInitReq, opts)
	return c, nil
}

// Creates a new connection in a given initial state
func newConnection(ch *TChannel, conn net.Conn, initialState connectionState,
	opts *ConnectionOptions) *Connection {

	if opts == nil {
		opts = &ConnectionOptions{}
	}

	sendBufferSize := opts.SendBufferSize
	if sendBufferSize <= 0 {
		sendBufferSize = 512
	}

	recvBufferSize := opts.RecvBufferSize
	if recvBufferSize <= 0 {
		recvBufferSize = 512
	}

	framePool := opts.FramePool
	if framePool == nil {
		framePool = DefaultFramePool
	}

	c := &Connection{
		ch:            ch,
		log:           ch.log,
		conn:          conn,
		framePool:     framePool,
		state:         initialState,
		sendCh:        make(chan *Frame, sendBufferSize),
		localPeerInfo: opts.PeerInfo,
		checksumType:  opts.ChecksumType,
		inbound: messageExchangeSet{
			name:      messageExchangeSetInbound,
			log:       ch.log,
			exchanges: make(map[uint32]*messageExchange),
			framePool: framePool,
		},
		outbound: messageExchangeSet{
			name:      messageExchangeSetOutbound,
			log:       ch.log,
			exchanges: make(map[uint32]*messageExchange),
			framePool: framePool,
		},
		handlers: ch.handlers,
	}

	go c.readFrames()
	go c.writeFrames()
	return c
}

// Initiates a handshake with a peer.
func (c *Connection) sendInit(ctx context.Context) error {
	err := c.withStateLock(func() error {
		switch c.state {
		case connectionWaitingToSendInitReq:
			c.state = connectionWaitingToRecvInitRes
			return nil
		case connectionWaitingToRecvInitReq:
			return errConnectionWaitingOnPeerInit
		case connectionClosed, connectionStartClose, connectionInboundClosed:
			return ErrConnectionClosed
		case connectionActive, connectionWaitingToRecvInitRes:
			return errConnectionAlreadyActive
		default:
			return fmt.Errorf("connection in unknown state %d", c.state)
		}
	})
	if err != nil {
		return err
	}

	initMsgID := c.NextMessageID()
	req := initReq{initMessage{id: initMsgID}}
	req.Version = CurrentProtocolVersion
	req.initParams = initParams{
		InitParamHostPort:    c.localPeerInfo.HostPort,
		InitParamProcessName: c.localPeerInfo.ProcessName,
	}

	mex, err := c.outbound.newExchange(ctx, req.messageType(), req.ID(), 1)
	if err != nil {
		return c.connectionError(err)
	}

	defer c.outbound.removeExchange(req.ID())

	if err := c.sendMessage(&req); err != nil {
		return c.connectionError(err)
	}

	res := initRes{initMessage{id: initMsgID}}
	err = c.recvMessage(ctx, &res, mex.recvCh)
	if err != nil {
		return c.connectionError(err)
	}

	if res.Version != CurrentProtocolVersion {
		return c.connectionError(fmt.Errorf("Unsupported protocol version %d from peer", res.Version))
	}

	c.remotePeerInfo.HostPort = res.initParams[InitParamHostPort]
	c.remotePeerInfo.ProcessName = res.initParams[InitParamProcessName]

	c.withStateLock(func() error {
		if c.state == connectionWaitingToRecvInitRes {
			c.state = connectionActive
		}
		return nil
	})

	return nil
}

// Handles an incoming InitReq.  If we are waiting for the peer to send us an InitReq, and the
// InitReq is valid, send a corresponding InitRes and mark ourselves as active
func (c *Connection) handleInitReq(frame *Frame) {
	defer c.framePool.Release(frame)

	if err := c.withStateRLock(func() error {
		return nil
	}); err != nil {
		c.connectionError(err)
		return
	}

	var req initReq
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	if err := req.read(rbuf); err != nil {
		// TODO(mmihic): Technically probably a protocol error
		c.connectionError(err)
		return
	}

	if req.Version != CurrentProtocolVersion {
		// TODO(mmihic): Send protocol error
		c.connectionError(fmt.Errorf("Unsupported protocol version %d from peer", req.Version))
		return
	}

	c.remotePeerInfo.HostPort = req.initParams[InitParamHostPort]
	c.remotePeerInfo.ProcessName = req.initParams[InitParamProcessName]

	res := initRes{initMessage{id: frame.Header.ID}}
	res.initParams = initParams{
		InitParamHostPort:    c.localPeerInfo.HostPort,
		InitParamProcessName: c.localPeerInfo.ProcessName,
	}
	res.Version = CurrentProtocolVersion
	if err := c.sendMessage(&res); err != nil {
		c.connectionError(err)
		return
	}

	c.withStateLock(func() error {
		switch c.state {
		case connectionWaitingToRecvInitReq:
			c.state = connectionActive
		}

		return nil
	})
}

// Handles an incoming InitRes.  If we are waiting for the peer to send us an InitRes, forward the InitRes
// to the waiting goroutine
// TODO(mmihic): There is a race condition here, in that the peer might start sending us requests before
// the goroutine doing initialization has a chance to process the InitRes.  We probably want to move
// the InitRes checking to here (where it will run in the receiver goroutine and thus block new incoming
// messages), and simply signal the init goroutine that we are done
func (c *Connection) handleInitRes(frame *Frame) {
	if err := c.withStateRLock(func() error {
		switch c.state {
		case connectionWaitingToRecvInitRes:
			return nil
		case connectionClosed, connectionStartClose, connectionInboundClosed:
			return ErrConnectionClosed

		case connectionActive:
			return errConnectionAlreadyActive

		case connectionWaitingToSendInitReq:
			return ErrConnectionNotReady

		case connectionWaitingToRecvInitReq:
			return errConnectionWaitingOnPeerInit

		default:
			return fmt.Errorf("Connection in unknown state %d", c.state)
		}

	}); err != nil {
		c.framePool.Release(frame)
		c.connectionError(err)
		return
	}

	if err := c.outbound.forwardPeerFrame(frame.Header.ID, frame); err != nil {
		c.framePool.Release(frame)
		c.connectionError(errCannotHandleInitRes)
	}
}

// Sends a standalone message (typically a control message)
func (c *Connection) sendMessage(msg message) error {
	f, err := marshalMessage(msg, c.framePool)
	if err != nil {
		return nil
	}

	select {
	case c.sendCh <- f:
		return nil
	default:
		return ErrSendBufferFull
	}
}

// Receives a standalone message (typically a control message)
func (c *Connection) recvMessage(ctx context.Context, msg message, resCh <-chan *Frame) error {
	select {
	case <-ctx.Done():
		return ctx.Err()

	case frame := <-resCh:
		defer c.framePool.Release(frame)

		msgBuf := typed.NewReadBuffer(frame.SizedPayload())
		err := msg.read(msgBuf)
		return err
	}
}

// NextMessageID reserves the next available message id for this connection
func (c *Connection) NextMessageID() uint32 {
	return atomic.AddUint32(&c.nextMessageID, 1)
}

// Handles a connection error
func (c *Connection) connectionError(err error) error {
	doClose := false
	c.withStateLock(func() error {
		if c.state != connectionClosed {
			c.state = connectionClosed
			doClose = true
		}
		return nil
	})

	if doClose {
		c.closeNetwork()
	}

	return err
}

// Closes the network connection and all network-related channels
func (c *Connection) closeNetwork() {
	// NB(mmihic): The sender goroutine	will exit once the connection is closed; no need to close
	// the send channel (and closing the send channel would be dangerous since other goroutine might be sending)
	if err := c.conn.Close(); err != nil {
		c.log.Warnf("could not close connection to peer %s: %v", c.remotePeerInfo, err)
	}

	c.inbound.releaseAll()
	c.outbound.releaseAll()
}

// Performs an action with the connection state mutex locked
func (c *Connection) withStateLock(f func() error) error {
	c.stateMut.Lock()
	defer c.stateMut.Unlock()

	return f()
}

// Performs an action with the connection state mutex held in a read lock
func (c *Connection) withStateRLock(f func() error) error {
	c.stateMut.RLock()
	defer c.stateMut.RUnlock()

	return f()
}

// Main loop that reads frames from the network connection and dispatches to the appropriate handler.
// Run within its own goroutine to prevent overlapping reads on the socket.  Most handlers simply
// send the incoming frame to a channel; the init handlers are a notable exception, since we cannot
// process new frames until the initialization is complete.
func (c *Connection) readFrames() {
	for {
		frame := c.framePool.Get()
		if err := frame.ReadFrom(c.conn); err != nil {
			c.framePool.Release(frame)
			c.connectionError(err)
			return
		}

		switch frame.Header.messageType {
		case messageTypeCallReq:
			c.handleCallReq(frame)
		case messageTypeCallReqContinue:
			c.handleCallReqContinue(frame)
		case messageTypeCallRes:
			c.handleCallRes(frame)
		case messageTypeCallResContinue:
			c.handleCallResContinue(frame)
		case messageTypeInitReq:
			c.handleInitReq(frame)
		case messageTypeInitRes:
			c.handleInitRes(frame)
		case messageTypeError:
			c.handleError(frame)
		default:
			// TODO(mmihic): Log and close connection with protocol error
		}
	}
}

// Main loop that pulls frames from the send channel and writes them to the connection.
// Run in its own goroutine to prevent overlapping writes on the network socket.
func (c *Connection) writeFrames() {
	for f := range c.sendCh {
		defer c.framePool.Release(f)

		if err := f.WriteTo(c.conn); err != nil {
			c.connectionError(err)
			return
		}
	}
}

// Creates a new frame around a message
func marshalMessage(msg message, pool FramePool) (*Frame, error) {
	f := pool.Get()

	wbuf := typed.NewWriteBuffer(f.Payload[:])
	if err := msg.write(wbuf); err != nil {
		return nil, err
	}

	f.Header.ID = msg.ID()
	f.Header.messageType = msg.messageType()
	f.Header.SetPayloadSize(uint16(wbuf.BytesWritten()))
	return f, nil
}
