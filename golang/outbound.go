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
	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
	"time"
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
		conn: c,
		mex:  mex,
		req: callReq{
			id:         requestID,
			Headers:    callHeaders{},
			Service:    serviceName,
			TimeToLive: timeToLive,
		},
		res: &OutboundCallResponse{
			id:    requestID,
			conn:  c,
			mex:   mex,
			state: outboundCallResponseReadyToReadArg1,
		},
	}

	span := CurrentSpan(ctx)
	if span != nil {
		call.req.Tracing = *span.NewChildSpan()
	} else {
		// TODO(mmihic): Potentially reject calls that are made outside a root context?
		call.req.Tracing.EnableTracing(false)
	}

	call.body = newFragmentingWriter(call, c.checksumType.New())
	call.res.body = newFragmentingReader(call.res)
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

// An OutboundCall is an active call to a remote peer.  A client makes a call
// by calling BeginCall on the TChannel, writing argument content via
// WriteArg2() and WriteArg3(), and then reading reading response data via the
// ReadArg2() and ReadArg3() methods on the Response() object.
type OutboundCall struct {
	id    uint32
	req   callReq
	conn  *Connection
	body  *fragmentingWriter
	state outboundCallState
	res   *OutboundCallResponse
	mex   *messageExchange
}

type outboundCallState int

const (
	outboundCallReadyToWriteArg1 outboundCallState = iota
	outboundCallReadyToWriteArg2
	outboundCallReadyToWriteArg3
	outboundCallSent
	outboundCallError
)

// Response provides access to the call's response object, which can be used to
// read response arguments
func (call *OutboundCall) Response() *OutboundCallResponse {
	return call.res
}

// writeOperation writes the operation (arg1) to the call
func (call *OutboundCall) writeOperation(operation []byte) error {
	operationOut := BytesOutput(operation)
	return call.writeArg(operationOut, false, outboundCallReadyToWriteArg1, outboundCallReadyToWriteArg2)
}

// WriteArg2 writes the the second argument part to the request, blocking until
// the argument is written
func (call *OutboundCall) WriteArg2(arg Output) error {
	return call.writeArg(arg, false, outboundCallReadyToWriteArg2, outboundCallReadyToWriteArg3)
}

// WriteArg3 writes the third argument to the request, blocking until the
// argument is written
func (call *OutboundCall) WriteArg3(arg Output) error {
	return call.writeArg(arg, true, outboundCallReadyToWriteArg3, outboundCallSent)
}

// writeArg writes an argument if the call is in the proper state
func (call *OutboundCall) writeArg(arg Output, last bool,
	inState outboundCallState, outState outboundCallState) error {
	if call.state != inState {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.WriteArgument(arg, last); err != nil {
		return call.failed(err)
	}

	call.state = outState
	return nil
}

// failed marks a call as having failed
func (call *OutboundCall) failed(err error) error {
	call.conn.outboundCallComplete(call.id)
	call.state = outboundCallError
	return err
}

// newFragment starts a new fragment
func (call *OutboundCall) newFragment(initial bool, checksum Checksum) (*writableFragment, error) {
	frame := call.conn.framePool.Get()
	frame.Header.ID = call.id
	if initial {
		frame.Header.messageType = messageTypeCallReq
		return newWritableFragment(frame, &call.req, checksum)
	} else {
		frame.Header.messageType = messageTypeCallReqContinue
		return newWritableFragment(frame, &callReqContinue{id: call.id}, checksum)
	}
}

// flushFragment flushes a complete fragment to the remote peer
func (call *OutboundCall) flushFragment(fragment *writableFragment) error {
	payloadSize := uint16(fragment.contents.BytesWritten())
	frame := fragment.frame.(*Frame)
	frame.Header.SetPayloadSize(payloadSize)
	select {
	case <-call.mex.ctx.Done():
		return call.failed(call.mex.ctx.Err())
	case call.conn.sendCh <- frame:
		return nil
	default:
		return call.failed(ErrSendBufferFull)
	}
}

// An OutboundCallResponse is the response to an outbound call
type OutboundCallResponse struct {
	id           uint32
	responseCode ResponseCode
	checksum     Checksum
	conn         *Connection
	state        outboundCallResponseState
	mex          *messageExchange
	body         *fragmentingReader
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
	return call.responseCode == responseApplicationError
}

// readOperation reads the operation
func (call *OutboundCallResponse) readOperation(arg Input) error {
	return call.readArg(arg, false, outboundCallResponseReadyToReadArg1, outboundCallResponseReadyToReadArg2)
}

// ReadArg2 reads the second argument from the response, blocking until the
// argument is read or an error/timeout has occurred.
func (call *OutboundCallResponse) ReadArg2(arg Input) error {
	var operation BytesInput
	if err := call.readOperation(&operation); err != nil {
		return err
	}

	return call.readArg(arg, false, outboundCallResponseReadyToReadArg2, outboundCallResponseReadyToReadArg3)
}

func (call *OutboundCallResponse) readArg(arg Input, last bool,
	inState outboundCallResponseState, outState outboundCallResponseState) error {
	if call.state != inState {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.ReadArgument(arg, last); err != nil {
		return call.failed(err)
	}

	call.state = outState
	return nil
}

// ReadArg3 reads the third argument from the response, blocking until the
// argument is read or an error/timeout has occurred.
func (call *OutboundCallResponse) ReadArg3(arg Input) error {
	return call.readArg(arg, true, outboundCallResponseReadyToReadArg3, outboundCallResponseComplete)
}

/// failed marks the call as having failed
func (call *OutboundCallResponse) failed(err error) error {
	call.conn.log.Debugf("Call %d failed during response handling: %v", call.id, err)
	call.conn.outboundCallComplete(call.id)
	return err
}

func (call *OutboundCallResponse) recvNextFragment(initial bool) (*readableFragment, error) {
	msg := message(new(callRes))
	if !initial {
		msg = new(callResContinue)
	}

	frame, err := call.mex.recvPeerFrameOfType(msg.messageType())
	if err != nil {
		return nil, err
	}

	return newReadableFragment(frame, msg)
}

// handleError andles an error coming back from the peer server. If the error
// is a protocol level error, the entire connection will be closed.  If the
// error is a reqest specific error, it will be written to the request's
// response channel and converted into a SystemError returned from the next
// reader or access call.
func (c *Connection) handleError(frame *Frame) {
	var errorMessage errorMessage
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	if err := errorMessage.read(rbuf); err != nil {
		c.log.Warnf("Unable to read Error frame from %s: %v", c.remotePeerInfo, err)
		c.connectionError(err)
		return
	}

	if errorMessage.errCode == ErrCodeProtocol {
		c.log.Warnf("Peer %s reported protocol error: %s", c.remotePeerInfo, errorMessage.message)
		c.connectionError(errorMessage.AsSystemError())
		return
	}

	if err := c.outbound.forwardPeerFrame(frame.Header.ID, frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

func newWritableFragment(frame *Frame, msg message, checksum Checksum) (*writableFragment, error) {
	wbuf := typed.NewWriteBuffer(frame.Payload[:])
	fragment := new(writableFragment)
	fragment.frame = frame
	fragment.flagsRef = wbuf.DeferByte()
	if err := msg.write(wbuf); err != nil {
		return nil, err
	}
	wbuf.WriteByte(byte(checksum.TypeCode()))
	fragment.checksumRef = wbuf.DeferBytes(checksum.Size())
	fragment.checksum = checksum
	fragment.contents = wbuf
	return fragment, wbuf.Err()
}

func newReadableFragment(frame *Frame, msg message) (*readableFragment, error) {
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	fragment := new(readableFragment)
	fragment.flags = rbuf.ReadByte()
	if err := msg.read(rbuf); err != nil {
		return nil, err
	}

	fragment.checksumType = ChecksumType(rbuf.ReadByte())
	fragment.checksum = rbuf.ReadBytes(fragment.checksumType.ChecksumSize())
	fragment.contents = rbuf
	return fragment, rbuf.Err()
}
