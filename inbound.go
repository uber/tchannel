package tchannel

import (
	"errors"
	"io"
	"io/ioutil"
	"sync"

	"code.google.com/p/go.net/context"
	"github.com/op/go-logging"
)

var (
	ErrHandlerNotFound = NewSystemError(ErrorCodeBadRequest, "no handler for service and operation")

	ErrInboundCallStateMismatch         = errors.New("inbound call in bad state")
	ErrInboundCallResponseStateMismatch = errors.New("inbound call response in bad state")
	ErrInboundRequestAlreadyActive      = errors.New("inbound request is already active; possible duplicate client id")
)

// Pipeline for handling incoming requests for service
type inboundCallPipeline struct {
	handlers       *handlerMap
	remotePeerInfo PeerInfo
	activeReqChs   map[uint32]chan *Frame
	sendCh         chan<- *Frame
	reqLock        sync.Mutex
	framePool      FramePool
	log            *logging.Logger
}

// Creates a new pipeline for handling inbound calls
func newInboundCallPipeline(remotePeerInfo PeerInfo, sendCh chan<- *Frame, handlers *handlerMap,
	framePool FramePool, log *logging.Logger) *inboundCallPipeline {
	return &inboundCallPipeline{
		remotePeerInfo: remotePeerInfo,
		sendCh:         sendCh,
		framePool:      framePool,
		handlers:       handlers,
		activeReqChs:   make(map[uint32]chan *Frame),
		log:            log,
	}
}

// Handles an incoming call request, dispatching the call to the worker pool
func (p *inboundCallPipeline) handleCallReq(frame *Frame) {
	reqCh := make(chan *Frame, 512) // TODO(mmihic): Control incoming buffer size
	err := p.withReqLock(func() error {
		if p.activeReqChs[frame.Header.Id] != nil {
			return ErrInboundRequestAlreadyActive
		}

		p.activeReqChs[frame.Header.Id] = reqCh
		return nil
	})

	if err != nil {
		// TODO(mmihic): Possibly fail request
		return
	}

	var callReq CallReq
	firstFragment, err := newInboundFragment(frame, &callReq, nil)
	if err != nil {
		// TODO(mmihic): Probably protocol error
		p.log.Error("Could not decode call req %d from %s: %v",
			frame.Header.Id, p.remotePeerInfo, err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), callReq.TimeToLive)
	ctxWrapper := inboundCallContext{ctx, cancel}

	res := &InboundCallResponse{
		id:       frame.Header.Id,
		pipeline: p,
		state:    inboundCallResponsePreSend,
		ctx:      ctxWrapper,
		checksum: ChecksumTypeCrc32.New(), // TODO(mmihic): Make configurable or mirror req?
	}
	res.partWriter = newMultiPartWriter(res)

	call := &InboundCall{
		id:               frame.Header.Id,
		pipeline:         p,
		res:              res,
		recvCh:           reqCh,
		ctx:              ctxWrapper,
		curFragment:      firstFragment,
		recvLastFragment: firstFragment.last,
		serviceName:      string(callReq.Service),
		state:            inboundCallPreRead,
	}

	go p.dispatchInbound(call)
}

// Handles the continuation of a call request.  Adds the frame to the channel for that call.
func (p *inboundCallPipeline) handleCallReqContinue(frame *Frame) {
	var reqCh chan<- *Frame
	p.withReqLock(func() error {
		reqCh = p.activeReqChs[frame.Header.Id]
		return nil
	})

	if reqCh == nil {
		// This is ok, just means the request timed out or was cancelled etc
		return
	}

	select {
	case reqCh <- frame:
		// Ok
	default:
		// Application not reading fragments quickly enough; kill off the request
		// TODO(mmihic): Send down a server busy error frame
		p.inboundCallComplete(frame.Header.Id)
		close(reqCh)
	}
}

// Called when an inbound request has completed (either successfully or due to timeout or error)
func (p *inboundCallPipeline) inboundCallComplete(messageId uint32) {
	p.withReqLock(func() error {
		delete(p.activeReqChs, messageId)
		return nil
	})
}

// Performs some action with the inbound request lock held.  Typically involves
// mutating the activeReqChs.
func (p *inboundCallPipeline) withReqLock(f func() error) error {
	p.reqLock.Lock()
	defer p.reqLock.Unlock()

	return f()
}

// Dispatches an inbound call to the appropriate handler
func (p *inboundCallPipeline) dispatchInbound(call *InboundCall) {
	p.log.Debug("Received incoming call for %s from %s", call.ServiceName(), p.remotePeerInfo)

	if err := call.readOperation(); err != nil {
		p.log.Error("Could not read operation from %s: %v", p.remotePeerInfo, err)
		p.inboundCallComplete(call.id)
		return
	}

	// NB(mmihic): Don't cast operation name to string here - this will create a copy
	// of the byte array, where as aliasing to string in the map look up can be optimized
	// by the compiler to avoid the copy.  See https://github.com/golang/go/issues/3512
	h := p.handlers.find(call.ServiceName(), call.Operation())
	if h == nil {
		p.log.Error("Could not find handler for %s:%s", call.ServiceName(), call.Operation())
		call.Response().SendSystemError(ErrHandlerNotFound)
		return
	}

	p.log.Debug("Dispatching %s:%s from %s", call.ServiceName(), call.Operation(), p.remotePeerInfo)
	h.Handle(call.ctx.ctx, call)
}

// An InboundCall is an incoming call from a peer
type InboundCall struct {
	id               uint32
	pipeline         *inboundCallPipeline
	res              *InboundCallResponse
	ctx              inboundCallContext
	serviceName      string
	operation        []byte
	state            inboundCallState
	recvLastFragment bool
	recvCh           <-chan *Frame
	curFragment      *inFragment
	lastPartReader   *multiPartReader
	checksum         Checksum
}

type inboundCallState int

const (
	inboundCallPreRead inboundCallState = iota
	inboundCallReadyForArg2
	inboundCallReadingArg2
	inboundCallReadingArg3
	inboundCallAllRead
	inboundCallError
)

// Returns the name of the service being called
func (call *InboundCall) ServiceName() string {
	return call.serviceName
}

// Returns the operation being called
func (call *InboundCall) Operation() []byte {
	return call.operation
}

// Reads the entire operation name (arg1) from the request stream.
func (call *InboundCall) readOperation() error {
	if call.state != inboundCallPreRead {
		return call.failed(ErrInboundCallStateMismatch)
	}

	r := newMultiPartReader(call, false)
	arg1, err := ioutil.ReadAll(r)
	if err != nil {
		return call.failed(err)
	}

	if err := r.endPart(); err != nil {
		return call.failed(err)
	}

	call.state = inboundCallReadyForArg2
	call.operation = arg1
	return nil
}

// Begins the process of reading the second argument from the inbound call.  Returns an io.Reader
// that can be used to read the bytestream of the second argument.  The first argument must have been
// fully read before this method is called.
func (call *InboundCall) ExpectArg2() (io.Reader, error) {
	if call.state != inboundCallReadyForArg2 {
		return nil, call.failed(ErrInboundCallStateMismatch)
	}

	call.state = inboundCallReadingArg2
	call.lastPartReader = newMultiPartReader(call, false)
	return call.lastPartReader, nil
}

// Begins the process of reading the third argument from the inbound call.  Returns an io.Reader
// that can be used to read the bytestream of the third argument.  The second argument must have
// been fully read before this method is called.
func (call *InboundCall) ExpectArg3() (io.Reader, error) {
	if call.state != inboundCallReadingArg2 {
		return nil, call.failed(ErrInboundCallStateMismatch)
	}

	if err := call.lastPartReader.endPart(); err != nil {
		return nil, call.failed(err)
	}

	call.state = inboundCallReadingArg3
	call.lastPartReader = newMultiPartReader(call, true)
	return call.lastPartReader, nil

}

// Marks the call as failed
func (call *InboundCall) failed(err error) error {
	call.state = inboundCallError
	call.pipeline.inboundCallComplete(call.id)
	return err
}

// Closes the inbound call, confirming that all inbound arguments have been read
func (call *InboundCall) Close() error {
	if call.state != inboundCallReadingArg3 {
		return call.failed(ErrInboundCallStateMismatch)
	}

	if err := call.lastPartReader.endPart(); err != nil {
		return call.failed(err)
	}

	call.state = inboundCallAllRead
	return nil
}

// Provides access to the response object
func (call *InboundCall) Response() *InboundCallResponse {
	return call.res
}

// Acting like an inFragmentChannel
func (call *InboundCall) waitForFragment() (*inFragment, error) {
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
		reqContinue := CallReqContinue{id: call.res.id}
		fragment, err := newInboundFragment(frame, &reqContinue, call.checksum)
		if err != nil {
			return nil, call.failed(err)
		}

		call.curFragment = fragment
		call.recvLastFragment = fragment.last
		return fragment, nil
	}
}

// Used to send the response back to the calling peer
type InboundCallResponse struct {
	id                   uint32
	ctx                  inboundCallContext
	checksum             Checksum
	pipeline             *inboundCallPipeline
	state                inboundCallResponseState
	startedFirstFragment bool
	partWriter           *multiPartWriter
	applicationError     bool
}

type inboundCallResponseState int

const (
	inboundCallResponsePreSend inboundCallResponseState = iota
	inboundCallResponseWritingArg2
	inboundCallResponseWritingArg3
	inboundCallResponseComplete
	inboundCallResponseError
)

// Sends a system error response to the peer
func (call *InboundCallResponse) SendSystemError(err error) error {
	// Fail all future attempts to read fragments
	call.ctx.Cancel()
	call.state = inboundCallResponseComplete

	// Send the error frame
	frame, err := MarshalMessage(&ErrorMessage{
		id:                call.id,
		OriginalMessageId: call.id,
		ErrorCode:         GetSystemErrorCode(err),
		Message:           err.Error()}, call.pipeline.framePool)

	if err != nil {
		// Nothing we can do here
		call.pipeline.log.Warning("Could not create outbound frame to %s for %d: %v",
			call.pipeline.remotePeerInfo, call.id, err)
		return nil
	}

	select {
	case call.pipeline.sendCh <- frame: // Good to go
	default: // Nothing we can do here anyway
		call.pipeline.log.Warning("Could not send error frame to %s for %d : %v",
			call.pipeline.remotePeerInfo, call.id, err)
	}

	return nil
}

// Marks the response as being an application error.  Must be marked before any arguments are begun
func (call *InboundCallResponse) SetApplicationError() error {
	if call.state != inboundCallResponsePreSend {
		return ErrInboundCallResponseStateMismatch
	}

	call.applicationError = true
	return nil
}

// Begins writing arg 2.  Returns an io.Writer that can be used to stream the contents of the second argument.
func (call *InboundCallResponse) BeginArg2() (io.Writer, error) {
	if call.state != inboundCallResponsePreSend {
		return nil, call.failed(ErrInboundCallResponseStateMismatch)
	}

	call.state = inboundCallResponseWritingArg2
	return call.partWriter, nil
}

// Begins writing arg 3.  Returns an io.Writer that can be used to stream the contents of the third argument.
// The second argument is considered complete once the third argument has begun
func (call *InboundCallResponse) BeginArg3() (io.Writer, error) {
	if call.state != inboundCallResponseWritingArg2 {
		return nil, call.failed(ErrInboundCallResponseStateMismatch)
	}

	if err := call.partWriter.endPart(false); err != nil {
		return nil, call.failed(err)
	}

	call.state = inboundCallResponseWritingArg3
	return call.partWriter, nil
}

// Sends the completed response to the peer.
func (call *InboundCallResponse) Send() error {
	if call.state != inboundCallResponseWritingArg3 {
		return call.failed(ErrInboundCallResponseStateMismatch)
	}

	if err := call.partWriter.endPart(true); err != nil {
		return call.failed(err)
	}

	call.state = inboundCallResponseComplete
	call.pipeline.inboundCallComplete(call.id)
	return nil
}

// Marks the call as failed
func (call *InboundCallResponse) failed(err error) error {
	call.state = inboundCallResponseError
	call.pipeline.inboundCallComplete(call.id)
	return err
}

// Begins a new response fragment
func (call *InboundCallResponse) beginFragment() (*outFragment, error) {
	frame := call.pipeline.framePool.Get()
	var msg Message
	if !call.startedFirstFragment {
		responseCode := ResponseOK
		if call.applicationError {
			responseCode = ResponseApplicationError
		}

		msg = &CallRes{
			id:           call.id,
			ResponseCode: responseCode,
			Headers:      CallHeaders{},
			// TODO(mmihic): Tracing
		}
	} else {
		msg = &CallResContinue{id: call.id}
	}

	return newOutboundFragment(frame, msg, call.checksum)
}

// Sends a response fragment back to the peer
func (call *InboundCallResponse) flushFragment(f *outFragment, last bool) error {
	select {
	case call.pipeline.sendCh <- f.finish(last):
		return nil
	default:
		// TODO(mmihic): Probably need to abort the whole thing
		return ErrSendBufferFull
	}
}

// Wrapper around a context and cancel object
type inboundCallContext struct {
	ctx    context.Context
	cancel context.CancelFunc
}

func (ctx inboundCallContext) Cancel() {
	ctx.cancel()
}

func (ctx inboundCallContext) Done() <-chan struct{} {
	return ctx.ctx.Done()
}

func (ctx inboundCallContext) Err() error {
	return ctx.ctx.Err()
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
