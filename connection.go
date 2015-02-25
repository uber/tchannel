package tchannel

import (
	"errors"
	"github.com/op/go-logging"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

var log = logging.MustGetLogger("tchannel.TChannelConnection")

const CurrentProtocolVersion = uint16(0x02)

var (
	// Error returned when a connection is closing and new requests are not permitted
	ErrConnectionClosing = errors.New("connection is closing")

	// Error returned when a caller takes an action on a closed connection
	ErrConnectionClosed = errors.New("connection is closed")

	// Error returned when a caller tries to initialize an already active connection
	ErrConnectionAlreadyActive = errors.New("connection is already active")

	// Error returned when a caller tries to initialize an already initializing connection
	ErrConnectionAlreadyInitializing = errors.New("connection is already initializing")

	// Error returned when a caller tries to initialize a receive-side connection
	ErrConnectionWaitingToRecvInit = errors.New("connection is waiting for initiator to send init")

	// Error returned when a caller tries to send something over an uninitialization channel
	ErrConnectionNotInitialized = errors.New("connection is not initialized")

	// Timeout error
	ErrTimeout = errors.New("timeout waiting for peer")

	// Bad initialization handshake with peer
	ErrBadInitHandshake = errors.New("bad init handshake with peer")

	// Could not send message, send buffer exceeded
	ErrSendBufferExceeded = errors.New("send buffer exceeded")
)

type connectionState int

const (
	connectionWaitingToRecvInit connectionState = iota
	connectionWaitingToSendInit
	connectionSendingInit
	connectionRecvInit
	connectionActive
	connectionClosing
	connectionClosed
)

type TChannelConnection struct {
	peerInfo      string
	conn          net.Conn
	reader        MessageReader
	writer        MessageWriter
	state         connectionState
	stateMutex    sync.RWMutex
	outbox        chan Message
	inbox         chan Message
	nextMessageId uint32
	wg            sync.WaitGroup
}

type TChannelConnectionOptions struct {
	SendBufferSize        int
	RecvBufferSize        int
	DefaultRequestTimeout time.Duration
}

func NewOutboundConnection(conn net.Conn, peerInfo string, opts *TChannelConnectionOptions) *TChannelConnection {
	return newConnection(conn, connectionWaitingToSendInit, peerInfo, opts)
}

func NewInboundConnection(conn net.Conn, opts *TChannelConnectionOptions) *TChannelConnection {
	return newConnection(conn, connectionWaitingToRecvInit, "", opts)
}

func newConnection(conn net.Conn, initialState connectionState, peerInfo string,
	opts *TChannelConnectionOptions) *TChannelConnection {
	if opts == nil {
		opts = &TChannelConnectionOptions{}
	}

	sendBufferSize := opts.SendBufferSize
	if sendBufferSize <= 0 {
		sendBufferSize = 500
	}

	recvBufferSize := opts.RecvBufferSize
	if recvBufferSize <= 0 {
		recvBufferSize = 500
	}

	c := &TChannelConnection{
		peerInfo:   peerInfo,
		conn:       conn,
		state:      initialState,
		reader:     NewMessageReader(conn),
		writer:     NewMessageWriter(conn),
		stateMutex: sync.RWMutex{},
		outbox:     make(chan Message, opts.SendBufferSize),
		inbox:      make(chan Message, opts.RecvBufferSize),
	}

	c.wg.Add(2)
	go c.runReceiver()
	go c.runSender()

	return c
}

func (c *TChannelConnection) Init() error {
	{
		c.stateMutex.Lock()
		defer c.stateMutex.Unlock()

		switch c.state {
		case connectionWaitingToSendInit:
			c.state = connectionSendingInit
		case connectionWaitingToRecvInit, connectionRecvInit:
			return ErrConnectionWaitingToRecvInit
		case connectionSendingInit:
			return ErrConnectionAlreadyInitializing
		case connectionActive:
			return ErrConnectionAlreadyActive
		case connectionClosing:
			return ErrConnectionClosing
		case connectionClosed:
			return ErrConnectionClosed
		}
	}

	reqId := c.NextMessageId()
	if err := c.Send(&InitReq{initMessage{id: reqId, Version: CurrentProtocolVersion}}); err != nil {
		return c.connectionError(err)
	}

	select {
	// TODO(mmihic): Make wait timeout configurable
	case <-time.After(time.Second * 30):
		c.connectionError(ErrTimeout)
		return ErrTimeout

	case m := <-c.inbox:
		if m.Type() != MessageTypeInitRes {
			log.Warning("peer %s responded to InitReq with message type %x", c.peerInfo, m.Type())
			return c.connectionError(ErrBadInitHandshake)
		}

		if m.Id() != reqId {
			log.Warning("peer %s did not respond with same InitReq id", c.peerInfo)
			return c.connectionError(ErrBadInitHandshake)
		}

		initRes := m.(*InitRes)
		if initRes.Version != CurrentProtocolVersion {
			log.Warning("peer %s requested unsupported protocol version %d", c.peerInfo, initRes.Version)
			return c.connectionError(ErrBadInitHandshake)
		}

		if len(initRes.InitParams) > 0 {
			log.Warning("peer %s requested unsupported init params: %s", c.peerInfo, initRes.InitParams)
			return c.connectionError(ErrBadInitHandshake)
		}

		{
			c.stateMutex.Lock()
			defer c.stateMutex.Unlock()
			c.state = connectionActive
		}

	}

	return nil
}

func (c *TChannelConnection) NextMessageId() uint32 {
	return atomic.AddUint32(&c.nextMessageId, 1)
}

func (c *TChannelConnection) Close() error {
	closeUnderlying := false

	{
		c.stateMutex.Lock()
		defer c.stateMutex.Unlock()
	}

	return nil
}

func (c *TChannelConnection) Send(msg Message) error {
	{
		c.stateMutex.RLock()
		defer c.stateMutex.RUnlock()

		switch c.state {
		case connectionWaitingToSendInit, connectionWaitingToRecvInit:
			return ErrConnectionNotInitialized
		case connectionSendingInit:
			if msg.Type() != MessageTypeInitReq {
				return ErrConnectionNotInitialized
			}
		case connectionRecvInit:
			if msg.Type() != MessageTypeInitRes {
				return ErrConnectionNotInitialized
			}
		case connectionClosing:
			if msg.Type() != MessageTypeError && msg.Type() != MessageTypeCallRes {
				return ErrConnectionClosing
			}
		case connectionClosed:
			return ErrConnectionClosed

		}
	}

	select {
	case c.outbox <- msg:
		return nil
	default:
		return ErrSendBufferExceeded
	}
}

func (c *TChannelConnection) connectionError(err error) error {
	{
		c.stateMutex.Lock()
		defer c.stateMutex.Unlock()

		switch c.state {
		case connectionWaitingToRecvInit, connectionWaitingToSendInit,
			connectionClosing, connectionActive:
			c.state = connectionClosed

		case connectionClosed:
			return err
		}
	}

	if errClose := c.conn.Close(); errClose != nil {
		log.Warning("unable to close socket connection to %s: %v", c.peerInfo, errClose)
	}

	return err
}

func (c *TChannelConnection) runReceiver() {
	for {
		msg, err := c.reader.Read()
		if err != nil {
			c.connectionError(err)
			close(c.inbox)
			break
		}

	}

	c.wg.Done()
}

func (c *TChannelConnection) runSender() {
	for msg := range c.outbox {
		// TODO(mmihic): Don't keep trying to send if the connection is closed
		if err := c.writer.Write(msg); err != nil {
			// TODO(mmihic): We don't close the outbox here because there might be active senders
			// and we don't want to cause a panic.  We'll need to figure out where to close
			// the channel to avoid a leak
			c.connectionError(err)
			break
		}
	}

	c.wg.Done()
}
