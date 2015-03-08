package tchannel

import (
	"errors"
	"io"

	"code.google.com/p/go.net/context"
)

var (
	ErrArgMismatch             = errors.New("argument mismatch")
	ErrOutboundCallStillActive = errors.New("outbound call still active (possible id wrap?)")
)

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

	reqId := c.NextMessageId()
	call := &OutboundCall{
		id:   reqId,
		ctx:  ctx,
		conn: c,
		req: CallReq{
			id:         reqId,
			TraceFlags: 0x00,          // TODO(mmihic): Enable tracing based on ctx
			Headers:    CallHeaders{}, // TODO(mmihic): Format headers etc
			Service:    []byte(serviceName),
		},
		recvCh:   make(chan *Frame, 512), // TODO(mmihic): Control channel size
		checksum: c.checksumType.New(),
	}

	if err := c.withReqLock(func() error {
		if c.activeResChs[call.id] != nil {
			return ErrOutboundCallStillActive
		}

		c.activeResChs[call.id] = call.recvCh
		return nil
	}); err != nil {
		return nil, err
	}

	call.argWriter = newArgumentWriter(call)
	return call, nil
}

// A call to a remote peer.  A client makes a call by calling BeginCall on the TChannel, writing
// argument content via the writers returned from BeginArg1(), BeginArg2(), BeginArg3(), and finally
// calling Send().  Send() returns an OutboundCallResponse that can be used to wait for and read
// the response content.
type OutboundCall struct {
	id                uint32
	req               CallReq
	checksum          Checksum
	conn              *TChannelConnection
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
		id:     call.id,
		ctx:    call.ctx,
		conn:   call.conn,
		recvCh: call.recvCh,
	}

	select {
	case <-call.ctx.Done():
		return nil, call.failed(call.ctx.Err())

	case frame := <-call.recvCh:
		firstFragment, err := newInboundFragment(frame, &res.res, nil)
		if err != nil {
			return nil, call.failed(err)
		}

		res.curFragment = firstFragment
		res.recvLastFragment = firstFragment.last
		res.checksum = firstFragment.checksum
	}

	// TODO(mmihic): Wait for the first fragment
	return res, nil
}

// Marks a call as having failed
func (call *OutboundCall) failed(err error) error {
	call.conn.outboundCallComplete(call.id)
	call.state = outboundCallError
	return err
}

// Starts a new fragment to send to the remote peer
func (call *OutboundCall) startFragment() (*outboundFragment, error) {
	frame := call.conn.framePool.Get()

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

	case call.conn.sendCh <- fragment.finish(last):
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
	conn             *TChannelConnection
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
		resContinue := CallResContinue{id: call.res.id}
		fragment, err := newInboundFragment(frame, &resContinue, call.checksum)
		if err != nil {
			return nil, call.failed(err)
		}

		call.curFragment = fragment
		call.recvLastFragment = fragment.last
		return fragment, nil
	}
}

// Indicates that the call has failed
func (call *OutboundCallResponse) failed(err error) error {
	call.conn.outboundCallComplete(call.id)
	return err
}

// Marks an outbound call as being complete
func (c *TChannelConnection) outboundCallComplete(messageId uint32) {
	c.withReqLock(func() error {
		delete(c.activeResChs, messageId)
		return nil
	})
}

// TODO(mmihic): Eventually these will have different semantics
// Handles a CallRes frame.  Finds the response channel corresponding to that
// message and sends it the frame
func (c *TChannelConnection) handleCallRes(frame *Frame) {
	c.forwardResFrame(frame)
}

func (c *TChannelConnection) handleCallResContinue(frame *Frame) {
	c.forwardResFrame(frame)
}

func (c *TChannelConnection) handleCallResError(frame *Frame) {
	c.forwardResFrame(frame)
}

func (c *TChannelConnection) forwardResFrame(frame *Frame) {
	var resCh chan<- *Frame
	c.withReqLock(func() error {
		resCh = c.activeResChs[frame.Header.Id]
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
		c.outboundCallComplete(frame.Header.Id)
	}
}

func (c *TChannelConnection) handleError(frame *Frame) {
}
