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
	"io"
	"time"

	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
)

// beginCall begins an outbound call on the connection
func (c *Connection) beginCall(ctx context.Context, serviceName string, callOptions *CallOptions) (*OutboundCall, error) {
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

	headers := callHeaders{
		CallerName: c.localPeerInfo.ServiceName,
	}
	callOptions.setHeaders(headers)

	call := new(OutboundCall)
	call.mex = mex
	call.conn = c
	call.callReq = callReq{
		id:         requestID,
		Headers:    headers,
		Service:    serviceName,
		TimeToLive: timeToLive,
	}

	// TODO(mmihic): It'd be nice to do this without an fptr
	call.messageForFragment = func(initial bool) message {
		if initial {
			return &call.callReq
		}

		return new(callReqContinue)
	}

	call.contents = newFragmentingWriter(call, c.checksumType.New())
	span := CurrentSpan(ctx)
	if span != nil {
		call.callReq.Tracing = *span.NewChildSpan()
	} else {
		// TODO(mmihic): Potentially reject calls that are made outside a root context?
		call.callReq.Tracing.EnableTracing(false)
	}

	response := new(OutboundCallResponse)
	response.mex = mex
	response.messageForFragment = func(initial bool) message {
		if initial {
			return &response.callRes
		}

		return new(callResContinue)
	}
	response.contents = newFragmentingReader(response)
	call.response = response
	return call, nil
}

// handleCallRes handles an incoming call req message, forwarding the
// frame to the response channel waiting for it
func (c *Connection) handleCallRes(frame *Frame) {
	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

// handleCallResContinue handles an incoming call res continue message,
// forwarding the frame to the response channel waiting for it
func (c *Connection) handleCallResContinue(frame *Frame) {
	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

// An OutboundCall is an active call to a remote peer.  A client makes a call
// by calling BeginCall on the Channel, writing argument content via
// ArgWriter2() ArgWriter3(), and then reading reading response data via the
// ArgReader2() and ArgReader3() methods on the Response() object.
type OutboundCall struct {
	reqResWriter

	callReq  callReq
	response *OutboundCallResponse
}

// Response provides access to the call's response object, which can be used to
// read response arguments
func (call *OutboundCall) Response() *OutboundCallResponse {
	return call.response
}

// writeOperation writes the operation (arg1) to the call
func (call *OutboundCall) writeOperation(operation []byte) error {
	return NewArgWriter(call.arg1Writer()).Write(operation)
}

// Arg2Writer returns a WriteCloser that can be used to write the second argument.
// The returned writer must be closed once the write is complete.
func (call *OutboundCall) Arg2Writer() (io.WriteCloser, error) {
	return call.arg2Writer()
}

// Arg3Writer returns a WriteCloser that can be used to write the last argument.
// The returned writer must be closed once the write is complete.
func (call *OutboundCall) Arg3Writer() (io.WriteCloser, error) {
	return call.arg3Writer()
}

// An OutboundCallResponse is the response to an outbound call
type OutboundCallResponse struct {
	reqResReader

	callRes callRes
}

// ApplicationError returns true if the call resulted in an application level error
// TODO(mmihic): In current implementation, you must have called Arg2Reader before this
// method returns the proper value.  We should instead have this block until the first
// fragment is available, if the first fragment hasn't been received.
func (response *OutboundCallResponse) ApplicationError() bool {
	// TODO(mmihic): Wait for first fragment
	return response.callRes.ResponseCode == responseApplicationError
}

// Arg2Reader returns an io.ReadCloser to read the second argument.
// The ReadCloser must be closed once the argument has been read.
func (response *OutboundCallResponse) Arg2Reader() (io.ReadCloser, error) {
	var operation []byte
	if err := NewArgReader(response.arg1Reader()).Read(&operation); err != nil {
		return nil, err
	}

	return response.arg2Reader()
}

// Arg3Reader returns an io.ReadCloser to read the last argument.
// The ReadCloser must be closed once the argument has been read.
func (response *OutboundCallResponse) Arg3Reader() (io.ReadCloser, error) {
	return response.arg3Reader()
}

// handleError andles an error coming back from the peer. If the error is a
// protocol level error, the entire connection will be closed.  If the error is
// a request specific error, it will be written to the request's response
// channel and converted into a SystemError returned from the next reader or
// access call.
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

	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}
