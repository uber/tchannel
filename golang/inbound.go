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
	"fmt"
	"io"
	"time"

	"golang.org/x/net/context"
)

var errInboundRequestAlreadyActive = errors.New("inbound request is already active; possible duplicate client id")

// handleCallReq handles an incoming call request, registering a message
// exchange to receive further fragments for that call, and dispatching it in
// another goroutine
func (c *Connection) handleCallReq(frame *Frame) bool {
	// TODO(prashant): Parse out the span from
	switch state := c.readState(); state {
	case connectionActive:
		break
	case connectionStartClose, connectionInboundClosed, connectionClosed:
		c.SendSystemError(frame.Header.ID, nil, ErrChannelClosed)
		return true
	case connectionWaitingToRecvInitReq, connectionWaitingToSendInitReq, connectionWaitingToRecvInitRes:
		c.SendSystemError(frame.Header.ID, nil, NewSystemError(ErrCodeDeclined, "connection not ready"))
		return true
	default:
		panic(fmt.Errorf("unknown connection state for call req: %v", state))
	}

	callReq := new(callReq)
	initialFragment, err := parseInboundFragment(c.framePool, frame, callReq)
	if err != nil {
		// TODO(mmihic): Probably want to treat this as a protocol error
		c.log.Errorf("could not decode %s: %v", frame.Header, err)
		return true
	}

	c.log.Debugf("span=%s", callReq.Tracing)
	call := new(InboundCall)
	ctx, cancel := newIncomingContext(call, callReq.TimeToLive, &callReq.Tracing)

	mex, err := c.inbound.newExchange(ctx, c.framePool, callReq.messageType(), frame.Header.ID, 512)
	if err != nil {
		c.log.Errorf("could not register exchange for %s", frame.Header)
		return true
	}

	call.AddBinaryAnnotation(BinaryAnnotation{Key: "cn", Value: callReq.Headers[CallerName]})
	call.AddBinaryAnnotation(BinaryAnnotation{Key: "as", Value: callReq.Headers[ArgScheme]})
	call.AddAnnotation(AnnotationKeyServerReceive)

	response := new(InboundCallResponse)
	response.mex = mex
	response.conn = c
	response.contents = newFragmentingWriter(response, initialFragment.checksumType.New())
	response.cancel = cancel
	response.span = callReq.Tracing
	response.log = c.log.WithFields(LogField{"In-Response", callReq.ID()})
	response.headers = transportHeaders{}
	response.messageForFragment = func(initial bool) message {
		if initial {
			call.AddAnnotation(AnnotationKeyServerSend)
			call.Report(callReq.Tracing, c.traceReporter)

			callRes := new(callRes)
			callRes.Headers = response.headers
			callRes.ResponseCode = responseOK
			if response.applicationError {
				callRes.ResponseCode = responseApplicationError
			}
			return callRes
		}

		return new(callResContinue)
	}

	call.mex = mex
	call.initialFragment = initialFragment
	call.serviceName = string(callReq.Service)
	call.headers = callReq.Headers
	call.span = callReq.Tracing
	call.response = response
	call.log = c.log.WithFields(LogField{"In-Call", callReq.ID()})
	call.messageForFragment = func(initial bool) message { return new(callReqContinue) }
	call.contents = newFragmentingReader(call)
	call.statsReporter = c.statsReporter
	call.createStatsTags(c.commonStatsTags)

	response.statsReporter = c.statsReporter
	response.commonStatsTags = call.commonStatsTags

	setResponseHeaders(call.headers, response.headers)
	go c.dispatchInbound(call)
	return false
}

// handleCallReqContinue handles the continuation of a call request, forwarding
// it to the request channel for that request, where it can be pulled during
// defragmentation
func (c *Connection) handleCallReqContinue(frame *Frame) bool {
	if err := c.inbound.forwardPeerFrame(frame); err != nil {
		c.inbound.removeExchange(frame.Header.ID)
		return true
	}
	return false
}

// createStatsTags creates the common stats tags, if they are not already created.
func (call *InboundCall) createStatsTags(connectionTags map[string]string) {
	call.commonStatsTags = map[string]string{
		"calling-service": call.CallerName(),
	}
	for k, v := range connectionTags {
		call.commonStatsTags[k] = v
	}
}

// dispatchInbound ispatches an inbound call to the appropriate handler
func (c *Connection) dispatchInbound(call *InboundCall) {
	c.log.Debugf("Received incoming call for %s from %s", call.ServiceName(), c.remotePeerInfo)

	if err := call.readOperation(); err != nil {
		c.log.Errorf("Could not read operation from %s: %v", c.remotePeerInfo, err)
		return
	}

	call.commonStatsTags["endpoint"] = string(call.operation)
	call.statsReporter.IncCounter("inbound.calls.recvd", call.commonStatsTags, 1)
	call.response.calledAt = timeNow()

	// NB(mmihic): Don't cast operation name to string here - this will
	// create a copy of the byte array, where as aliasing to string in the
	// map look up can be optimized by the compiler to avoid the copy.  See
	// https://github.com/golang/go/issues/3512
	h := c.handlers.find(call.ServiceName(), call.Operation())
	if h == nil {
		// CHeck the subchannel map to see if we find one there
		c.log.Debugf("Checking the subchannel's handlers for %s:%s", call.ServiceName(), call.Operation())
		h = c.subchannels.find(call.ServiceName(), call.Operation())
	}
	if h == nil {
		c.log.Errorf("Could not find handler for %s:%s", call.ServiceName(), call.Operation())
		call.mex.shutdown()
		call.Response().SendSystemError(
			NewSystemError(ErrCodeBadRequest, "no handler for service %q and operation %q", call.ServiceName(), call.Operation()))
		return
	}

	// TODO(prashant): This is an expensive way to check for cancellation, and is not thread-safe.
	// We need to figure out a better solution to avoid leaking calls that timeout.
	go func() {
		<-call.mex.ctx.Done()
		if call.mex.ctx.Err() != nil {
			call.failed(call.mex.ctx.Err())
		}
	}()

	c.log.Debugf("Dispatching %s:%s from %s", call.ServiceName(), call.Operation(), c.remotePeerInfo)
	h.Handle(call.mex.ctx, call)
}

// An InboundCall is an incoming call from a peer
type InboundCall struct {
	Annotations
	reqResReader

	response        *InboundCallResponse
	serviceName     string
	operation       []byte
	headers         transportHeaders
	span            Span
	statsReporter   StatsReporter
	commonStatsTags map[string]string
}

// ServiceName returns the name of the service being called
func (call *InboundCall) ServiceName() string {
	return call.serviceName
}

// Operation returns the operation being called
func (call *InboundCall) Operation() []byte {
	return call.operation
}

// Format the format of the request from the ArgScheme transport header.
func (call *InboundCall) Format() Format {
	return Format(call.headers[ArgScheme])
}

// CallerName returns the caller name from the CallerName transport header.
func (call *InboundCall) CallerName() string {
	return call.headers[CallerName]
}

// Reads the entire operation name (arg1) from the request stream.
func (call *InboundCall) readOperation() error {
	var arg1 []byte
	if err := NewArgReader(call.arg1Reader()).Read(&arg1); err != nil {
		return call.failed(err)
	}

	call.operation = arg1
	return nil
}

// Arg2Reader returns an io.ReadCloser to read the second argument.
// The ReadCloser must be closed once the argument has been read.
func (call *InboundCall) Arg2Reader() (io.ReadCloser, error) {
	return call.arg2Reader()
}

// Arg3Reader returns an io.ReadCloser to read the last argument.
// The ReadCloser must be closed once the argument has been read.
func (call *InboundCall) Arg3Reader() (io.ReadCloser, error) {
	return call.arg3Reader()
}

// Response provides access to the InboundCallResponse object which can be used
// to write back to the calling peer
func (call *InboundCall) Response() *InboundCallResponse {
	return call.response
}

func (call *InboundCall) doneReading() {}

// An InboundCallResponse is used to send the response back to the calling peer
type InboundCallResponse struct {
	reqResWriter

	cancel context.CancelFunc
	// calledAt is the time the inbound call was routed to the application.
	calledAt         time.Time
	applicationError bool
	headers          transportHeaders
	span             Span
	statsReporter    StatsReporter
	commonStatsTags  map[string]string
}

// SendSystemError returns a system error response to the peer.  The call is considered
// complete after this method is called, and no further data can be written.
func (response *InboundCallResponse) SendSystemError(err error) error {
	// Fail all future attempts to read fragments
	response.cancel()
	response.state = reqResWriterComplete

	return response.conn.SendSystemError(response.mex.msgID, CurrentSpan(response.mex.ctx), err)
}

// SetApplicationError marks the response as being an application error.  This method can
// only be called before any arguments have been sent to the calling peer.
func (response *InboundCallResponse) SetApplicationError() error {
	if response.state > reqResWriterPreArg2 {
		return response.failed(errReqResWriterStateMismatch{
			state:         response.state,
			expectedState: reqResWriterPreArg2,
		})
	}
	response.applicationError = true
	return nil
}

// Arg2Writer returns a WriteCloser that can be used to write the second argument.
// The returned writer must be closed once the write is complete.
func (response *InboundCallResponse) Arg2Writer() (ArgWriter, error) {
	if err := NewArgWriter(response.arg1Writer()).Write(nil); err != nil {
		return nil, err
	}
	return response.arg2Writer()
}

// Arg3Writer returns a WriteCloser that can be used to write the last argument.
// The returned writer must be closed once the write is complete.
func (response *InboundCallResponse) Arg3Writer() (ArgWriter, error) {
	return response.arg3Writer()
}

// doneSending shuts down the message exchange for this call.
// For incoming calls, the last message is sending the call response.
func (response *InboundCallResponse) doneSending() {
	if response.applicationError {
		response.statsReporter.IncCounter("inbound.calls.app-errors", response.commonStatsTags, 1)
	} else {
		response.statsReporter.IncCounter("inbound.calls.success", response.commonStatsTags, 1)
	}
	latency := timeNow().Sub(response.calledAt)
	response.statsReporter.RecordTimer("inbound.calls.latency", response.commonStatsTags, latency)

	response.mex.shutdown()
}

// errorSending shuts down the message exhcnage for this call, and records counters.
func (response *InboundCallResponse) errorSending() {
	response.mex.shutdown()
}
