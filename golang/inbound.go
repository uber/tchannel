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

	"golang.org/x/net/context"
)

var (
	// ErrHandlerNotFound is returned when no registered handler can be found for a given service and operation
	ErrHandlerNotFound = NewSystemError(ErrCodeBadRequest, "no handler for service and operation")

	errInboundRequestAlreadyActive = errors.New("inbound request is already active; possible duplicate client id")
)

// handleCallReq handls an incoming call request, registering a message
// exchange to receive further fragments for that call, and dispatching it in
// another goroutine
func (c *Connection) handleCallReq(frame *Frame) {
	callReq := new(callReq)
	initialFragment, err := parseInboundFragment(frame, callReq)
	if err != nil {
		// TODO(mmihic): Probably want to treat this as a protocol error
		c.log.Errorf("could not decode %s: %v", frame.Header, err)
		return
	}

	c.log.Debugf("span=%s", callReq.Tracing)
	ctx, cancel := context.WithTimeout(context.Background(), callReq.TimeToLive)
	ctx = context.WithValue(ctx, tracingKey, &callReq.Tracing)

	mex, err := c.inbound.newExchange(ctx, callReq.messageType(), frame.Header.ID, 512)
	if err != nil {
		c.log.Errorf("could not register exchange for %s", frame.Header)
		return
	}

	response := new(InboundCallResponse)
	response.mex = mex
	response.conn = c
	response.contents = newFragmentingWriter(response, initialFragment.checksumType.New())
	response.cancel = cancel
	response.span = callReq.Tracing
	response.messageForFragment = func(initial bool) message {
		if initial {
			callRes := new(callRes)
			callRes.Headers = callHeaders{}
			callRes.ResponseCode = responseOK
			if response.applicationError {
				callRes.ResponseCode = responseApplicationError
			}
			return callRes
		}

		return new(callResContinue)
	}

	call := new(InboundCall)
	call.mex = mex
	call.initialFragment = initialFragment
	call.serviceName = string(callReq.Service)
	call.headers = callReq.Headers
	call.span = callReq.Tracing
	call.response = response
	call.messageForFragment = func(initial bool) message { return new(callReqContinue) }
	call.contents = newFragmentingReader(call)

	go c.dispatchInbound(call)
}

// handleCallReqContinue handles the continuation of a call request, forwarding
// it to the request channel for that request, where it can be pulled during
// defragmentation
func (c *Connection) handleCallReqContinue(frame *Frame) {
	if err := c.inbound.forwardPeerFrame(frame); err != nil {
		c.inbound.removeExchange(frame.Header.ID)
	}
}

// dispatchInbound ispatches an inbound call to the appropriate handler
func (c *Connection) dispatchInbound(call *InboundCall) {
	c.log.Debugf("Received incoming call for %s from %s", call.ServiceName(), c.remotePeerInfo)

	if err := call.readOperation(); err != nil {
		c.log.Errorf("Could not read operation from %s: %v", c.remotePeerInfo, err)
		return
	}

	// NB(mmihic): Don't cast operation name to string here - this will
	// create a copy of the byte array, where as aliasing to string in the
	// map look up can be optimized by the compiler to avoid the copy.  See
	// https://github.com/golang/go/issues/3512
	h := c.handlers.find(call.ServiceName(), call.Operation())
	if h == nil {
		c.log.Errorf("Could not find handler for %s:%s", call.ServiceName(), call.Operation())
		call.mex.shutdown()
		call.Response().SendSystemError(ErrHandlerNotFound)
		return
	}

	c.log.Debugf("Dispatching %s:%s from %s", call.ServiceName(), call.Operation(), c.remotePeerInfo)
	h.Handle(call.mex.ctx, call)
}

// An InboundCall is an incoming call from a peer
type InboundCall struct {
	reqResReader

	response    *InboundCallResponse
	serviceName string
	operation   []byte
	headers     callHeaders
	span        Span
}

// ServiceName returns the name of the service being called
func (call *InboundCall) ServiceName() string {
	return call.serviceName
}

// Operation returns the operation being called
func (call *InboundCall) Operation() []byte {
	return call.operation
}

// Headers returns the call headers from the request.
func (call *InboundCall) Format() Format {
	return Format(call.headers[ArgScheme])
}

func (call *InboundCall) CallerName() string {
	return call.headers[CallerName]
}

// Reads the entire operation name (arg1) from the request stream.
func (call *InboundCall) readOperation() error {
	var arg1 BytesInput
	if err := call.readArg1(&arg1); err != nil {
		return call.failed(err)
	}

	call.operation = arg1
	return nil
}

// ReadArg2 reads the second argument from the request, blocking until the
// argument is ready or an error/timeout has occurred
func (call *InboundCall) ReadArg2(arg Input) error {
	return call.readArg2(arg)
}

// ReadArg3 reads the third argument from the request, blocking until the
// argument is ready or an error/timeout has occurred.
func (call *InboundCall) ReadArg3(arg Input) error {
	return call.readArg3(arg)
}

// Response provides access to the InboundCallResponse object which can be used
// to write back to the calling peer
func (call *InboundCall) Response() *InboundCallResponse {
	return call.response
}

// An InboundCallResponse is used to send the response back to the calling peer
type InboundCallResponse struct {
	reqResWriter

	cancel           context.CancelFunc
	applicationError bool
	span             Span
}

// SendSystemError returns a system error response to the peer.  The call is considered
// complete after this method is called, and no further data can be written.
func (response *InboundCallResponse) SendSystemError(err error) error {
	// Fail all future attempts to read fragments
	response.cancel()
	response.state = reqResWriterComplete

	// Send the error frame
	frame := response.conn.framePool.Get()
	if err := frame.write(&errorMessage{
		id:      response.mex.msgID,
		tracing: response.span,
		errCode: GetSystemErrorCode(err),
		message: err.Error()}); err != nil {
		// Nothing we can do here
		response.conn.log.Warnf("Could not create outbound frame to %s for %d: %v",
			response.conn.remotePeerInfo, response.mex.msgID, err)
		return nil
	}

	select {
	case response.conn.sendCh <- frame: // Good to go
	default: // Nothing we can do here anyway
		response.conn.log.Warnf("Could not send error frame to %s for %d : %v",
			response.conn.remotePeerInfo, response.mex.msgID, err)
	}

	return nil
}

// SetApplicationError marks the response as being an application error.  This method can
// only be called before any arguments have been sent to the calling peer.
func (response *InboundCallResponse) SetApplicationError() error {
	if response.state > reqResWriterPreArg2 {
		return response.failed(errReqResReaderStateMismatch)
	}
	response.applicationError = true
	return nil
}

// WriteArg2 writes the second argument in the response, blocking until the argument is
// fully written or an error/timeout has occurred.
func (response *InboundCallResponse) WriteArg2(arg Output) error {
	if err := response.writeArg1(BytesOutput(nil)); err != nil {
		return err
	}

	return response.writeArg2(arg)
}

// WriteArg3 writes the third argument in the response, blocking until the argument is
// fully written or an error/timeout has occurred
func (response *InboundCallResponse) WriteArg3(arg Output) error {
	return response.writeArg3(arg)
}
