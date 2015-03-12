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
	"github.com/op/go-logging"
	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
	"io"
	"sync"
	"time"
)

var (
	errUnexpectedFragmentType  = errors.New("unexpected message type received on fragment stream")
	errOutboundCallStillActive = errors.New("outbound call still active (possible id wrap?)")
)

// Pipeline for sending outgoing requests for service to a peer
type outboundCallPipeline struct {
	remotePeerInfo PeerInfo
	activeResChs   map[uint32]chan *Frame
	sendCh         chan<- *Frame
	reqLock        sync.Mutex
	framePool      FramePool
	log            *logging.Logger
}

func newOutboundCallPipeline(remotePeerInfo PeerInfo, sendCh chan<- *Frame,
	framePool FramePool, log *logging.Logger) *outboundCallPipeline {
	return &outboundCallPipeline{
		remotePeerInfo: remotePeerInfo,
		sendCh:         sendCh,
		framePool:      framePool,
		activeResChs:   make(map[uint32]chan *Frame),
		log:            log,
	}
}

func (p *outboundCallPipeline) beginCall(ctx context.Context, requestID uint32, serviceName string,
	checksumType ChecksumType) (*OutboundCall, error) {
	deadline, ok := ctx.Deadline()
	if !ok {
		return nil, ErrTimeout
	}

	timeToLive := deadline.Sub(time.Now())
	if timeToLive < 0 {
		return nil, ErrTimeout
	}

	call := &OutboundCall{
		id:       requestID,
		ctx:      ctx,
		pipeline: p,
		req: callReq{
			id:         requestID,
			TraceFlags: 0x00, // TODO(mmihic): Enable tracing based on ctx
			Headers:    callHeaders{},
			Service:    []byte(serviceName),
			TimeToLive: timeToLive,
		},
		recvCh:   make(chan *Frame, 512), // TODO(mmihic): Control channel size
		checksum: checksumType.New(),
	}

	call.res = &OutboundCallResponse{
		id:       call.id,
		ctx:      call.ctx,
		pipeline: call.pipeline,
		recvCh:   call.recvCh,
	}

	if err := p.withReqLock(func() error {
		if p.activeResChs[call.id] != nil {
			return errOutboundCallStillActive
		}

		p.activeResChs[call.id] = call.recvCh
		return nil
	}); err != nil {
		return nil, err
	}

	call.body = newBodyWriter(call)
	return call, nil
}

// Marks an outbound call as being complete
func (p *outboundCallPipeline) outboundCallComplete(messageID uint32) {
	p.withReqLock(func() error {
		delete(p.activeResChs, messageID)
		return nil
	})
}

// TODO(mmihic): Eventually these will have different semantics
// Handles a CallRes frame.  Finds the response channel corresponding to that
// message and sends it the frame
func (p *outboundCallPipeline) handleCallRes(frame *Frame) {
	p.forwardResFrame(frame)
}

func (p *outboundCallPipeline) handleCallResContinue(frame *Frame) {
	p.forwardResFrame(frame)
}

// Forwards a response frame to the appropriate response handling channel
func (p *outboundCallPipeline) forwardResFrame(frame *Frame) {
	var resCh chan<- *Frame
	p.withReqLock(func() error {
		resCh = p.activeResChs[frame.Header.ID]
		return nil
	})

	if resCh == nil {
		// This is ok, just means the request timed out or was cancelled or had an error or whatever
		return
	}

	select {
	case resCh <- frame:
		// Ok
	default:
		// Application isn't reading frames fast enough, kill it off
		close(resCh)
		p.outboundCallComplete(frame.Header.ID)
	}
}

// Handles an error frame for an active request.
func (p *outboundCallPipeline) handleError(frame *Frame, errorMessage *errorMessage) {
	requestID := errorMessage.originalMessageID
	p.log.Warning("Peer %s reported error %d for request %d",
		p.remotePeerInfo, errorMessage.errorCode, requestID)

	var resCh chan<- *Frame
	p.withReqLock(func() error {
		resCh = p.activeResChs[requestID]
		return nil
	})

	if resCh == nil {
		p.log.Warning("Received error for non-existent req %d from %s", requestID, p.remotePeerInfo)
		return
	}

	select {
	case resCh <- frame: // Ok
	default:
		// Can't write to frame channel, most likely the application has stopped reading from it
		p.log.Warning("Could not enqueue error %s(%s) frame to %d from %s",
			errorMessage.errorCode, errorMessage.message, requestID, p.remotePeerInfo)
		close(resCh)
		p.outboundCallComplete(requestID)
	}
}

// Performs a function with the pipeline's request lock held.  Typically modifies
// the map of active request channels
func (p *outboundCallPipeline) withReqLock(f func() error) error {
	p.reqLock.Lock()
	defer p.reqLock.Unlock()

	return f()
}

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

	return c.outbound.beginCall(ctx, c.NextMessageID(), serviceName, c.checksumType)
}

// An OutboundCall is an active call to a remote peer.  A client makes a call by calling BeginCall on the TChannel,
// writing argument content via WriteArg2() and WriteArg3(), and then reading reading response data via
// the ReadArg2() and ReadArg3() methods on the Response() object.
type OutboundCall struct {
	id                uint32
	req               callReq
	checksum          Checksum
	pipeline          *outboundCallPipeline
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
	call.pipeline.outboundCallComplete(call.id)
	call.state = outboundCallError
	return err
}

// Starts a new fragment to send to the remote peer
func (call *OutboundCall) beginFragment() (*outFragment, error) {
	frame := call.pipeline.framePool.Get()

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

	case call.pipeline.sendCh <- fragment.finish(last):
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
	pipeline           *outboundCallPipeline
	ctx                context.Context
	recvCh             chan *Frame
	state              outboundCallResponseState
	curFragment        *inFragment
	recvLastFragment   bool
	lastArgumentReader *bodyReader
}

type outboundCallResponseState int

const (
	outboundCallResponseReadyToReadArg2 = iota
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

// ReadArg2 reads the second argument from the response, blocking until the argument is read or
// an error/timeout has occurred.
func (call *OutboundCallResponse) ReadArg2(arg Input) error {
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
	if call.curFragment != nil && call.curFragment.hasMoreChunks() {
		return call.curFragment, nil
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
			return nil, call.failed(err.AsSystemError())

		default:
			// TODO(mmihic): Should be treated as a protocol error
			call.pipeline.log.Warning("Received unexpected message %d for %d from %s",
				int(frame.Header.messageType), frame.Header.ID, call.pipeline.remotePeerInfo)

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
	call.pipeline.outboundCallComplete(call.id)
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
		c.log.Warning("Unable to read Error frame from %s: %v", c.remotePeerInfo, err)
		c.connectionError(err)
		return
	}

	if errorMessage.errorCode == ErrorCodeProtocol {
		c.log.Warning("Peer %s reported protocol error: %s", c.remotePeerInfo, errorMessage.message)
		c.connectionError(errorMessage.AsSystemError())
		return
	}
	c.outbound.handleError(frame, &errorMessage)
}
