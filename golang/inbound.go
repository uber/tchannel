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
	"sync"

	"golang.org/x/net/context"
)

var (
	// ErrHandlerNotFound is returned when no registered handler can be found for a given service and operation
	ErrHandlerNotFound = NewSystemError(ErrCodeBadRequest, "no handler for service and operation")

	errCallStateMismatch           = errors.New("attempting to read / write outside of expected state")
	errInboundRequestAlreadyActive = errors.New("inbound request is already active; possible duplicate client id")
)

// Handles an incoming call request, dispatching the call to the worker pool
func (c *Connection) handleCallReq(frame *Frame) {
	callReq := callReq{id: frame.Header.ID}
	initialFragment, err := newReadableFragment(frame, &callReq)
	if err != nil {
		// TODO(mmihic): Probably want to treat this as a protocol error
		c.log.Errorf("could not decode %s: %v", frame.Header, err)
		return
	}

	c.log.Debugf("span=%s", callReq.Tracing)
	ctx, cancel := context.WithTimeout(context.Background(), callReq.TimeToLive)
	ctx = context.WithValue(ctx, tracingKey, &callReq.Tracing)

	mex, err := c.inbound.newExchange(ctx, callReq.messageType(), callReq.ID(), 512)
	if err != nil {
		c.log.Errorf("could not register exchange for %s", frame.Header)
		return
	}

	res := &InboundCallResponse{
		id:     frame.Header.ID,
		state:  inboundCallResponseReadyToWriteArg1,
		conn:   c,
		cancel: cancel,
		mex:    mex,
		span:   callReq.Tracing,
	}
	res.body = newFragmentingWriter(res, initialFragment.checksumType.New())

	call := &InboundCall{
		id:              frame.Header.ID,
		conn:            c,
		res:             res,
		mex:             mex,
		initialFragment: initialFragment,
		serviceName:     string(callReq.Service),
		state:           inboundCallReadyToReadArg1,
		span:            callReq.Tracing,
	}
	call.body = newFragmentingReader(call)

	go c.dispatchInbound(call)
}

// Handles the continuation of a call request.  Adds the frame to the channel for that call.
func (c *Connection) handleCallReqContinue(frame *Frame) {
	if err := c.inbound.forwardPeerFrame(frame.Header.ID, frame); err != nil {
		c.inbound.removeExchange(frame.Header.ID)
	}
}

// Called when an inbound request has completed (either successfully or due to timeout or error)
func (c *Connection) inboundCallComplete(messageID uint32) {
	c.inbound.removeExchange(messageID)
}

// Dispatches an inbound call to the appropriate handler
func (c *Connection) dispatchInbound(call *InboundCall) {
	c.log.Debugf("Received incoming call for %s from %s", call.ServiceName(), c.remotePeerInfo)

	if err := call.readOperation(); err != nil {
		c.log.Errorf("Could not read operation from %s: %v", c.remotePeerInfo, err)
		c.inboundCallComplete(call.id)
		return
	}

	// NB(mmihic): Don't cast operation name to string here - this will
	// create a copy of the byte array, where as aliasing to string in the
	// map look up can be optimized by the compiler to avoid the copy.  See
	// https://github.com/golang/go/issues/3512
	h := c.handlers.find(call.ServiceName(), call.Operation())
	if h == nil {
		c.log.Errorf("Could not find handler for %s:%s", call.ServiceName(), call.Operation())
		call.Response().SendSystemError(ErrHandlerNotFound)
		return
	}

	c.log.Debugf("Dispatching %s:%s from %s", call.ServiceName(), call.Operation(), c.remotePeerInfo)
	h.Handle(call.mex.ctx, call)
}

// An InboundCall is an incoming call from a peer
type InboundCall struct {
	id              uint32
	conn            *Connection
	res             *InboundCallResponse
	mex             *messageExchange
	serviceName     string
	operation       []byte
	state           inboundCallState
	initialFragment *readableFragment
	body            *fragmentingReader
	span            Span
}

type inboundCallState int

const (
	inboundCallReadyToReadArg1 inboundCallState = iota
	inboundCallReadyToReadArg2
	inboundCallReadyToReadArg3
	inboundCallAllRead
	inboundCallError
)

// ServiceName returns the name of the service being called
func (call *InboundCall) ServiceName() string {
	return call.serviceName
}

// Operation returns the operation being called
func (call *InboundCall) Operation() []byte {
	return call.operation
}

// Reads the entire operation name (arg1) from the request stream.
func (call *InboundCall) readOperation() error {
	var arg1 BytesInput
	if err := call.readArg(&arg1, false, inboundCallReadyToReadArg1, inboundCallReadyToReadArg2); err != nil {
		return err
	}

	call.operation = arg1
	return nil
}

// ReadArg2 reads the second argument from the inbound call, blocking until the entire
// argument has been read or an error/timeout occurs.
func (call *InboundCall) ReadArg2(arg Input) error {
	return call.readArg(arg, false, inboundCallReadyToReadArg2, inboundCallReadyToReadArg3)
}

// ReadArg3 reads the third argument from the inbound call, blocking until th entire
// argument has been read or an error/timeout occurs.
func (call *InboundCall) ReadArg3(arg Input) error {
	return call.readArg(arg, true, inboundCallReadyToReadArg3, inboundCallAllRead)
}

// failed marks the call as failed
func (call *InboundCall) failed(err error) error {
	call.state = inboundCallError
	call.conn.inboundCallComplete(call.id)
	return err
}

// readArg reads an argument from the call, assuming the call is in a given
// initial state.  Leaves the call in the provided output state
func (call *InboundCall) readArg(arg Input, last bool, inState inboundCallState, outState inboundCallState) error {
	if call.state != inState {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.ReadArgument(arg, last); err != nil {
		return call.failed(err)
	}

	call.state = outState
	return nil
}

// recvNextFragment returns the next incoming fragment for the call.  If this
// is the first fragment, we use the callReq that initiated the call.
// Otherwise we wait for more fragments to arrive from the peer through the
// mex
func (call *InboundCall) recvNextFragment(initial bool) (*readableFragment, error) {
	if initial {
		fragment := call.initialFragment
		call.initialFragment = nil
		return fragment, nil
	}

	msg := message(new(callReqContinue))
	frame, err := call.mex.recvPeerFrameOfType(msg.messageType())
	if err != nil {
		return nil, err
	}

	return newReadableFragment(frame, msg)
}

// Response provides access to the InboundCallResponse object which can be used
// to write back to the calling peer
func (call *InboundCall) Response() *InboundCallResponse {
	return call.res
}

// An InboundCallResponse is used to send the response back to the calling peer
type InboundCallResponse struct {
	id               uint32
	mex              *messageExchange
	cancel           context.CancelFunc
	conn             *Connection
	body             *fragmentingWriter
	state            inboundCallResponseState
	applicationError bool
	span             Span
}

type inboundCallResponseState int

const (
	inboundCallResponseReadyToWriteArg1 inboundCallResponseState = iota
	inboundCallResponseReadyToWriteArg2
	inboundCallResponseReadyToWriteArg3
	inboundCallResponseComplete
	inboundCallResponseError
)

// SendSystemError returns a system error response to the peer.  The call is considered
// complete after this method is called, and no further data can be written.
func (call *InboundCallResponse) SendSystemError(err error) error {
	// Fail all future attempts to read fragments
	call.cancel()
	call.state = inboundCallResponseComplete

	// Send the error frame
	frame := call.conn.framePool.Get()
	if err := frame.write(&errorMessage{
		id:      call.id,
		tracing: call.span,
		errCode: GetSystemErrorCode(err),
		message: err.Error()}); err != nil {
		// Nothing we can do here
		call.conn.log.Warnf("Could not create outbound frame to %s for %d: %v",
			call.conn.remotePeerInfo, call.id, err)
		return nil
	}

	select {
	case call.conn.sendCh <- frame: // Good to go
	default: // Nothing we can do here anyway
		call.conn.log.Warnf("Could not send error frame to %s for %d : %v",
			call.conn.remotePeerInfo, call.id, err)
	}

	return nil
}

// SetApplicationError marks the response as being an application error.  This method can
// only be called before any arguments have been sent to the calling peer.
func (call *InboundCallResponse) SetApplicationError() error {
	if call.state != inboundCallResponseReadyToWriteArg2 {
		return call.failed(errCallStateMismatch)
	}

	call.applicationError = true
	return nil
}

// writeOperation writes the operation.
func (call *InboundCallResponse) writeOperation(operation []byte) error {
	return call.writeArg(BytesOutput(operation), false, inboundCallResponseReadyToWriteArg1,
		inboundCallResponseReadyToWriteArg2)
}

// WriteArg2 writes the second argument in the response, blocking until the argument is
// fully written or an error/timeout has occurred.
func (call *InboundCallResponse) WriteArg2(arg Output) error {
	if err := call.writeOperation(nil); err != nil {
		return err
	}

	return call.writeArg(arg, false, inboundCallResponseReadyToWriteArg2,
		inboundCallResponseReadyToWriteArg3)
}

// WriteArg3 writes the third argument in the response, blocking until the argument is
// fully written or an error/timeout has occurred.
func (call *InboundCallResponse) WriteArg3(arg Output) error {
	return call.writeArg(arg, true, inboundCallResponseReadyToWriteArg3, inboundCallResponseComplete)
}

func (call *InboundCallResponse) writeArg(arg Output, last bool,
	inState inboundCallResponseState, outState inboundCallResponseState) error {
	if call.state != inState {
		return call.failed(errCallStateMismatch)
	}

	if err := call.body.WriteArgument(arg, last); err != nil {
		return call.failed(err)
	}

	call.state = outState
	return nil
}

// Marks the call as failed
func (call *InboundCallResponse) failed(err error) error {
	call.state = inboundCallResponseError
	call.conn.inboundCallComplete(call.id)
	return err
}

// newFragment allocates a new fragment to use for writing
func (call *InboundCallResponse) newFragment(initial bool, checksum Checksum) (*writableFragment, error) {
	frame := call.conn.framePool.Get()
	frame.Header.ID = call.id
	if initial {
		callRes := callRes{
			id:           call.id,
			ResponseCode: responseOK,
			Headers:      callHeaders{},
		}

		if call.applicationError {
			callRes.ResponseCode = responseApplicationError
		}

		if span := CurrentSpan(call.mex.ctx); span != nil {
			callRes.Tracing = *span
		}
		return newWritableFragment(frame, &callRes, checksum)
	} else {
		return newWritableFragment(frame, &callResContinue{}, checksum)
	}
}

// flushFragment sends a response fragment back to the peer
func (call *InboundCallResponse) flushFragment(fragment *writableFragment) error {
	// TODO(mmihic): This is identical to flushFragment on OutboundCall so unify
	frame := fragment.frame.(*Frame)
	frame.Header.SetPayloadSize(uint16(fragment.contents.BytesWritten()))
	select {
	case <-call.mex.ctx.Done():
		return call.failed(call.mex.ctx.Err())
	case call.conn.sendCh <- frame:
		return nil
	default:
		return call.failed(ErrSendBufferFull)
	}
}

// Manages handlers
type handlerMap struct {
	mut      sync.RWMutex
	handlers map[string]map[string]Handler
}

// Registers a handler
func (hmap *handlerMap) register(h Handler, serviceName, operation string) {
	hmap.mut.Lock()
	defer hmap.mut.Unlock()

	if hmap.handlers == nil {
		hmap.handlers = make(map[string]map[string]Handler)
	}

	operations := hmap.handlers[serviceName]
	if operations == nil {
		operations = make(map[string]Handler)
		hmap.handlers[serviceName] = operations
	}

	operations[operation] = h
}

// Finds the handler matching the given service and operation.  See https://github.com/golang/go/issues/3512
// for the reason that operation is []byte instead of a string
func (hmap *handlerMap) find(serviceName string, operation []byte) Handler {
	hmap.mut.RLock()
	defer hmap.mut.RUnlock()

	if operationMap := hmap.handlers[serviceName]; operationMap != nil {
		return operationMap[string(operation)]
	}

	return nil
}
