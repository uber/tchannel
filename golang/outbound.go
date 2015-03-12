package tchannel

import (
	"code.google.com/p/go.net/context"
	"code.uber.internal/personal/mmihic/tchannel-go/typed"
	"errors"
	"github.com/op/go-logging"
	"io"
	"sync"
	"time"
)

var (
	ErrUnexpectedFragmentType  = errors.New("unexpected message type received on fragment stream")
	ErrOutboundCallStillActive = errors.New("outbound call still active (possible id wrap?)")
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

func (p *outboundCallPipeline) beginCall(ctx context.Context, reqId uint32, serviceName string,
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
		id:       reqId,
		ctx:      ctx,
		pipeline: p,
		req: CallReq{
			id:         reqId,
			TraceFlags: 0x00,          // TODO(mmihic): Enable tracing based on ctx
			Headers:    CallHeaders{}, // TODO(mmihic): Format headers etc
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
			return ErrOutboundCallStillActive
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
func (p *outboundCallPipeline) outboundCallComplete(messageId uint32) {
	p.withReqLock(func() error {
		delete(p.activeResChs, messageId)
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
		resCh = p.activeResChs[frame.Header.Id]
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
		p.outboundCallComplete(frame.Header.Id)
	}
}

// Handles an error frame for an active request.
func (p *outboundCallPipeline) handleError(frame *Frame, errorMessage *ErrorMessage) {
	requestId := errorMessage.OriginalMessageId
	p.log.Warning("Peer %s reported error %d for request %d",
		p.remotePeerInfo, errorMessage.ErrorCode, requestId)

	var resCh chan<- *Frame
	p.withReqLock(func() error {
		resCh = p.activeResChs[requestId]
		return nil
	})

	if resCh == nil {
		p.log.Warning("Received error for non-existent req %d from %s", requestId, p.remotePeerInfo)
		return
	}

	select {
	case resCh <- frame: // Ok
	default:
		// Can't write to frame channel, most likely the application has stopped reading from it
		p.log.Warning("Could not enqueue error %s(%s) frame to %d from %s",
			errorMessage.ErrorCode, errorMessage.Message, requestId, p.remotePeerInfo)
		close(resCh)
		p.outboundCallComplete(requestId)
	}
}

// Performs a function with the pipeline's request lock held.  Typically modifies
// the map of active request channels
func (p *outboundCallPipeline) withReqLock(f func() error) error {
	p.reqLock.Lock()
	defer p.reqLock.Unlock()

	return f()
}

// Begins a call on a remote service.  Takes an execution context and a target service name, and returns
// a call object that can be used to write the arguments and wait for the response
// TODO(mmihic): Support options such as argument scheme and retries
func (c *TChannelConnection) BeginCall(ctx context.Context, serviceName string) (*OutboundCall, error) {
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

	return c.outbound.beginCall(ctx, c.NextMessageId(), serviceName, c.checksumType)
}

// A call to a remote peer.  A client makes a call by calling BeginCall on the TChannel, writing
// argument content via the writers returned from BeginArg1(), BeginArg2(), BeginArg3(), and finally
// calling Send().  Send() returns an OutboundCallResponse that can be used to wait for and read
// the response content.
type OutboundCall struct {
	id                uint32
	req               CallReq
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

// Provides access to the response object
func (call *OutboundCall) Response() *OutboundCallResponse {
	return call.res
}

// Writes the operation (arg1) to the call
func (call *OutboundCall) writeOperation(operation []byte) error {
	if call.state != outboundCallReadyToWriteArg1 {
		return call.failed(ErrCallStateMismatch)
	}

	if err := call.body.WriteArgument(BytesOutput(operation), false); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallReadyToWriteArg2
	return nil
}

// Writes the second argument part to the request, blocking until the argument is written
func (call *OutboundCall) WriteArg2(arg Output) error {
	if call.state != outboundCallReadyToWriteArg2 {
		return call.failed(ErrCallStateMismatch)
	}

	if err := call.body.WriteArgument(arg, false); err != nil {
		return call.failed(err)
	}

	call.state = outboundCallReadyToWriteArg3
	return nil
}

// Writes the third argument to the request, blocking until the argument is written
func (call *OutboundCall) WriteArg3(arg Output) error {
	if call.state != outboundCallReadyToWriteArg3 {
		return call.failed(ErrCallStateMismatch)
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

	var msg Message
	if !call.sentFirstFragment {
		msg = &call.req
		call.sentFirstFragment = true
	} else {
		msg = &CallReqContinue{id: call.id}
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

// Response to an outbound call
type OutboundCallResponse struct {
	id                 uint32
	res                CallRes
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

// if true, the call resulted in an application level error
func (call *OutboundCallResponse) ApplicationError() bool {
	// TODO(mmihic): Wait for first fragment
	return call.res.ResponseCode == ResponseApplicationError
}

// Reads the second argument from the response
func (call *OutboundCallResponse) ReadArg2(arg Input) error {
	if call.state != outboundCallResponseReadyToReadArg2 {
		return call.failed(ErrCallStateMismatch)
	}

	r := newBodyReader(call, false)
	if err := r.ReadArgument(arg, false); err != nil {
		return err
	}

	call.state = outboundCallResponseReadyToReadArg3
	return nil
}

// Reads the third argument from the response
func (call *OutboundCallResponse) ReadArg3(arg Input) error {
	if call.state != outboundCallResponseReadyToReadArg3 {
		return call.failed(ErrCallStateMismatch)
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
		switch frame.Header.Type {
		case MessageTypeCallRes:
			return call.parseFragment(frame, &call.res)

		case MessageTypeCallResContinue:
			return call.parseFragment(frame, &CallResContinue{})

		case MessageTypeError:
			// TODO(mmihic): Might want to change the channel to support either a frame
			// or an error message, and dispatch depending on which is sent.  Would
			// avoid the need for a double parse
			var err ErrorMessage
			err.read(typed.NewReadBuffer(frame.SizedPayload()))
			return nil, call.failed(err.AsSystemError())

		default:
			// TODO(mmihic): Should be treated as a protocol error
			call.pipeline.log.Warning("Received unexpected message %d for %d from %s",
				int(frame.Header.Type), frame.Header.Id, call.pipeline.remotePeerInfo)

			return nil, call.failed(ErrUnexpectedFragmentType)
		}
	}
}

// Parses an incoming fragment frame as a particular message type
func (call *OutboundCallResponse) parseFragment(frame *Frame, msg Message) (*inFragment, error) {
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
func (c *TChannelConnection) handleError(frame *Frame) {
	var errorMessage ErrorMessage
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	if err := errorMessage.read(rbuf); err != nil {
		c.log.Warning("Unable to read Error frame from %s: %v", c.remotePeerInfo, err)
		c.connectionError(err)
		return
	}

	if errorMessage.ErrorCode == ErrorCodeProtocol {
		c.log.Warning("Peer %s reported protocol error: %s", c.remotePeerInfo, errorMessage.Message)
		c.connectionError(errorMessage.AsSystemError())
		return
	}
	c.outbound.handleError(frame, &errorMessage)
}
