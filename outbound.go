package tchannel

import (
	"errors"
	"io"
	"sync"

	"code.google.com/p/go.net/context"
	"code.uber.internal/infra/mmihic/tchannel-go/typed"
	"github.com/op/go-logging"
)

var (
	ErrArgMismatch             = errors.New("argument mismatch")
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
	call := &OutboundCall{
		id:       reqId,
		ctx:      ctx,
		pipeline: p,
		req: CallReq{
			id:         reqId,
			TraceFlags: 0x00,          // TODO(mmihic): Enable tracing based on ctx
			Headers:    CallHeaders{}, // TODO(mmihic): Format headers etc
			Service:    []byte(serviceName),
		},
		recvCh:   make(chan *Frame, 512), // TODO(mmihic): Control channel size
		checksum: checksumType.New(),
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

	call.argWriter = newArgumentWriter(call)
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
	argWriter         *ArgumentWriter
	state             outboundCallState
	sentFirstFragment bool
	recvCh            chan *Frame
}

type outboundCallState int

const (
	outboundCallPreWrite outboundCallState = iota
	outboundCallWritingArg1
	outboundCallWritingArg2
	outboundCallWritingArg3
	outboundCallSent
	outboundCallError
)

// Begins writing the first argument to the call, returning an io.Writer for that argument's contents
func (call *OutboundCall) BeginArg1() (io.Writer, error) {
	if call.state != outboundCallPreWrite {
		return nil, call.failed(ErrArgMismatch)
	}
	call.state = outboundCallWritingArg1
	return call.argWriter, nil
}

// Begins writing the second argument to the call, returning an io.Writer for that argument's contents
func (call *OutboundCall) BeginArg2() (io.Writer, error) {
	if call.state != outboundCallWritingArg1 {
		return nil, call.failed(ErrArgMismatch)
	}
	if err := call.argWriter.EndArgument(false); err != nil {
		return nil, call.failed(err)
	}

	call.state = outboundCallWritingArg2
	return call.argWriter, nil
}

// Begins writing the third argument to the call, returning an io.Writer for that argument's contents
func (call *OutboundCall) BeginArg3() (io.Writer, error) {
	if call.state != outboundCallWritingArg2 {
		return nil, call.failed(ErrArgMismatch)
	}

	if err := call.argWriter.EndArgument(false); err != nil {
		return nil, call.failed(err)
	}

	call.state = outboundCallWritingArg3
	return call.argWriter, nil
}

// Sends the call and returns the response
func (call *OutboundCall) RoundTrip() (*OutboundCallResponse, error) {
	if call.state != outboundCallWritingArg3 {
		return nil, call.failed(ErrArgMismatch)
	}

	if err := call.argWriter.EndArgument(true); err != nil {
		return nil, call.failed(err)
	}

	call.state = outboundCallSent
	res := &OutboundCallResponse{
		id:       call.id,
		ctx:      call.ctx,
		pipeline: call.pipeline,
		recvCh:   call.recvCh,
	}

	// Wait for the first fragment to arrive
	_, err := res.waitForFragment()
	return res, err
}

// Marks a call as having failed
func (call *OutboundCall) failed(err error) error {
	call.pipeline.outboundCallComplete(call.id)
	call.state = outboundCallError
	return err
}

// Starts a new fragment to send to the remote peer
func (call *OutboundCall) startFragment() (*outboundFragment, error) {
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
func (call *OutboundCall) sendFragment(fragment *outboundFragment, last bool) error {
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
	id               uint32
	res              CallRes
	checksum         Checksum
	pipeline         *outboundCallPipeline
	ctx              context.Context
	recvCh           chan *Frame
	arg              int
	curFragment      *inboundFragment
	recvLastFragment bool
	lastArgReader    *ArgumentReader
}

// if true, the call resulted in an application level error
func (call *OutboundCallResponse) ApplicationError() bool {
	return call.res.ResponseCode == ResponseApplicationError
}

// Called by the application to begin processing the response arg2.  Returns an io.Reader that
// can be used to read the contents of the arg2.
func (call *OutboundCallResponse) ExpectArg2() (io.Reader, error) {
	if call.arg != 0 || call.lastArgReader != nil {
		return nil, ErrArgMismatch
	}

	call.arg++
	call.lastArgReader = newArgumentReader(call, false)
	return call.lastArgReader, nil
}

// Called by the application to begin processing the response arg3.  Returns an io.Reader that
// can be used to read the contents of arg3.
func (call *OutboundCallResponse) ExpectArg3() (io.Reader, error) {
	if call.arg != 1 || call.lastArgReader == nil {
		return nil, ErrArgMismatch
	}

	call.arg++
	call.lastArgReader = newArgumentReader(call, true)
	return call.lastArgReader, nil
}

// Closes the call, confirming that the last argument has been fully processed
func (call *OutboundCallResponse) Close() error {
	if call.lastArgReader != nil {
		return call.lastArgReader.EndArgument()
	}

	return nil
}

// Implementation of inboundFragmentChannel
func (call *OutboundCallResponse) waitForFragment() (*inboundFragment, error) {
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

func (call *OutboundCallResponse) parseFragment(frame *Frame, msg Message) (*inboundFragment, error) {
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

// Handles an error coming back from the peer server.
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
