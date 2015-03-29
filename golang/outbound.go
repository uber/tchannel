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
	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
	"io"
	"time"
)

var (
	errUnexpectedFragmentType = errors.New("unexpected message type received on fragment stream")
)

func (c *Connection) beginCall(ctx context.Context, serviceName string) (*OutboundCall, error) {
	if err := c.withStateRLock(func() error {
		switch c.state {
		case connectionActive, connectionStartClose, connectionInboundClosed:
			return nil
		case connectionClosed:
			return ErrConnectionClosed
		case connectionWaitingToRecvInitReq, connectionWaitingToSendInitReq, connectionWaitingToRecvInitRes:
			return ErrConnectionNotReady
		}

		return nil
	}); err != nil {
		return nil, err
	}

	deadline, _ := ctx.Deadline()
	timeToLive := deadline.Sub(time.Now())
	if timeToLive < 0 {
		return nil, ErrTimeout
	}

	requestID := c.NextMessageID()

	mex, err := c.outbound.newExchange(ctx, messageTypeCallReq, requestID, 512)
	if err != nil {
		return nil, err
	}

	call := &OutboundCall{
		id:   requestID,
		ctx:  ctx,
		conn: c,
		req: callReq{
			id:         requestID,
			Headers:    callHeaders{},
			Service:    []byte(serviceName),
			TimeToLive: timeToLive,
		},
		recvCh:   mex.recvCh,
		checksum: c.checksumType.New(),
		res: &OutboundCallResponse{
			id:     requestID,
			ctx:    ctx,
			conn:   c,
			recvCh: mex.recvCh,
			state:  outboundCallResponseReadyToReadArg1,
		},
	}

	span := CurrentSpan(ctx)
	if span != nil {
		call.req.Tracing = *span.NewChildSpan()
	} else {
		// TODO(mmihic): Potentially reject calls that are made outside a root context?
		call.req.Tracing.EnableTracing(false)
	}

	call.body = newBodyWriter(call)
	return call, nil
}

// Marks an outbound call as being complete
func (c *Connection) outboundCallComplete(messageID uint32) {
	c.outbound.removeExchange(messageID)
}

// TODO(mmihic): Eventually these will have different semantics
// Handles a CallRes frame.  Finds the response channel corresponding to that
// message and sends it the frame
func (c *Connection) handleCallRes(frame *Frame) {
	if err := c.outbound.forwardPeerFrame(frame.Header.ID, frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

func (c *Connection) handleCallResContinue(frame *Frame) {
	if err := c.outbound.forwardPeerFrame(frame.Header.ID, frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

// An OutboundCall is an active call to a remote peer.  A client makes a call by calling BeginCall on the TChannel,
// writing argument content via WriteArg2() and WriteArg3(), and then reading reading response data via
// the ReadArg2() and ReadArg3() methods on the Response() object.
type OutboundCall struct {
	id                uint32
	req               callReq
	checksum          Checksum
	conn              *Connection
	ctx               context.Context
	body              *bodyWriter
	state             outboundCallState
	sentFirstFragment bool
	recvCh            chan *Frame
	res               *OutboundCallResponse
}

type outboundCallState int

const (
	outboundCallReadyToWriteArg1 outboundCallState = iota
	outboundCallReadyToWriteArg2
	outboundCallReadyToWriteArg3
	outboundCallSent
	outboundCallError
)

// Response provides access to the call's response object, which can be used to read response arguments
func (call *OutboundCall) Response() *OutboundCallResponse {
	return call.res
}

// Writes the operation (arg1) to the call
func (call *OutboundCall) writeOperation(operation []byte) error {
	if call.state != outboundCallReadyToWriteArg1 {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.WriteArgument(BytesOutput(operation), false); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallReadyToWriteArg2
	return nil
}

// WriteArg2 writes the the second argument part to the request, blocking until the argument is written
func (call *OutboundCall) WriteArg2(arg Output) error {
	if call.state != outboundCallReadyToWriteArg2 {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.WriteArgument(arg, false); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallReadyToWriteArg3
	return nil
}

// WriteArg3 writes the third argument to the request, blocking until the argument is written
func (call *OutboundCall) WriteArg3(arg Output) error {
	if call.state != outboundCallReadyToWriteArg3 {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.WriteArgument(arg, true); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallSent
	return nil
}

// Marks a call as having failed
func (call *OutboundCall) failed(err error) error {
	call.conn.outboundCallComplete(call.id)
	call.state = outboundCallError
	return err
}

// Starts a new fragment to send to the remote peer
func (call *OutboundCall) beginFragment() (*outFragment, error) {
	frame := call.conn.framePool.Get()

	var msg message
	if !call.sentFirstFragment {
		msg = &call.req
		call.sentFirstFragment = true
	} else {
		msg = &callReqContinue{id: call.id}
	}

	frag, err := newOutboundFragment(frame, msg, call.checksum)
	if err != nil {
		return nil, call.failed(err)
	}

	return frag, nil
}

// Sends a complete fragment to the remote peer
func (call *OutboundCall) flushFragment(fragment *outFragment, last bool) error {
	select {
	case <-call.ctx.Done():
		return call.failed(call.ctx.Err())

	case call.conn.sendCh <- fragment.finish(last):
		return nil

	default:
		return call.failed(ErrSendBufferFull)
	}
}

// An OutboundCallResponse is the response to an outbound call
type OutboundCallResponse struct {
	id                 uint32
	res                callRes
	checksum           Checksum
	conn               *Connection
	ctx                context.Context
	recvCh             chan *Frame
	state              outboundCallResponseState
	curFragment        *inFragment
	recvLastFragment   bool
	lastArgumentReader *bodyReader
}

type outboundCallResponseState int

const (
	outboundCallResponseReadyToReadArg1 = iota
	outboundCallResponseReadyToReadArg2
	outboundCallResponseReadyToReadArg3
	outboundCallResponseComplete
)

// ApplicationError returns true if the call resulted in an application level error
// TODO(mmihic): In current implementation, you must have called ReadArg2 before this
// method returns the proper value.  We should instead have this block until the first
// fragment is available, if the first fragment hasn't been received.
func (call *OutboundCallResponse) ApplicationError() bool {
	// TODO(mmihic): Wait for first fragment
	return call.res.ResponseCode == responseApplicationError
}

// readOperation reads the operation
func (call *OutboundCallResponse) readOperation(arg Input) error {
	if call.state != outboundCallResponseReadyToReadArg1 {
		return call.failed(errCallStateMismatch)
	}

	r := newBodyReader(call, false)
	if err := r.ReadArgument(arg, false); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallResponseReadyToReadArg2
	return nil
}

// ReadArg2 reads the second argument from the response, blocking until the argument is read or
// an error/timeout has occurred.
func (call *OutboundCallResponse) ReadArg2(arg Input) error {
	var operation BytesInput
	if err := call.readOperation(&operation); err != nil {
		return err
	}

	if call.state != outboundCallResponseReadyToReadArg2 {
		return call.failed(errCallStateMismatch)
	}

	r := newBodyReader(call, false)
	if err := r.ReadArgument(arg, false); err != nil {
		return err
	}

	call.state = outboundCallResponseReadyToReadArg3
	return nil
}

// ReadArg3 reads the third argument from the response, blocking until the argument is read or
// an error/timeout has occurred.
func (call *OutboundCallResponse) ReadArg3(arg Input) error {
	if call.state != outboundCallResponseReadyToReadArg3 {
		return call.failed(errCallStateMismatch)
	}

	r := newBodyReader(call, true)
	if err := r.ReadArgument(arg, true); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallResponseComplete
	return nil
}

// Implementation of inFragmentChannel
func (call *OutboundCallResponse) waitForFragment() (*inFragment, error) {
	if call.curFragment != nil {
		if call.curFragment.hasMoreChunks() {
			return call.curFragment, nil
		}

		call.conn.framePool.Release(call.curFragment.frame)
		call.curFragment = nil
	}

	if call.recvLastFragment {
		return nil, call.failed(io.EOF)
	}

	select {
	case <-call.ctx.Done():
		return nil, call.failed(call.ctx.Err())

	case frame := <-call.recvCh:
		switch frame.Header.messageType {
		case messageTypeCallRes:
			return call.parseFragment(frame, &call.res)

		case messageTypeCallResContinue:
			return call.parseFragment(frame, &callResContinue{})

		case messageTypeError:
			// TODO(mmihic): Might want to change the channel to support either a frame
			// or an error message, and dispatch depending on which is sent.  Would
			// avoid the need for a double parse
			var err errorMessage
			err.read(typed.NewReadBuffer(frame.SizedPayload()))
			call.conn.framePool.Release(frame)
			return nil, call.failed(err.AsSystemError())

		default:
			// TODO(mmihic): Should be treated as a protocol error
			call.conn.log.Warnf("Received unexpected message %d for %d from %s",
				int(frame.Header.messageType), frame.Header.ID, call.conn.remotePeerInfo)

			call.conn.framePool.Release(frame)
			return nil, call.failed(errUnexpectedFragmentType)
		}
	}
}

// Parses an incoming fragment frame as a particular message type
func (call *OutboundCallResponse) parseFragment(frame *Frame, msg message) (*inFragment, error) {
	fragment, err := newInboundFragment(frame, msg, call.checksum)
	if err != nil {
		return nil, call.failed(err)
	}

	call.checksum = fragment.checksum
	call.curFragment = fragment
	call.recvLastFragment = fragment.last
	return fragment, nil
}

// Indicates that the call has failed
func (call *OutboundCallResponse) failed(err error) error {
	call.conn.outboundCallComplete(call.id)
	return err
}

// Handles an error coming back from the peer server. If the error is a protocol level error, the entire
// connection will be closed.  If the error is a reqest specific error, it will
// be written to the request's response channel and converted into a SystemError
// returned from the next reader or access call.
func (c *Connection) handleError(frame *Frame) {
	var errorMessage errorMessage
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	if err := errorMessage.read(rbuf); err != nil {
		c.log.Warnf("Unable to read Error frame from %s: %v", c.remotePeerInfo, err)
		c.connectionError(err)
		return
	}

	if errorMessage.errorCode == ErrorCodeProtocol {
		c.log.Warnf("Peer %s reported protocol error: %s", c.remotePeerInfo, errorMessage.message)
		c.connectionError(errorMessage.AsSystemError())
		return
	}

	requestID := errorMessage.originalMessageID
	if err := c.outbound.forwardPeerFrame(requestID, frame); err != nil {
		c.outbound.removeExchange(requestID)
	}
}
