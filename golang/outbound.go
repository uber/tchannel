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

package tchannel

import (
	"io"
	"time"

	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
)

// maxOperationSize is the maximum size of arg1.
const maxOperationSize = 16 * 1024

// beginCall begins an outbound call on the connection
func (c *Connection) beginCall(ctx context.Context, serviceName string, callOptions *CallOptions) (*OutboundCall, error) {
	switch c.readState() {
	case connectionActive, connectionStartClose:
		break
	case connectionInboundClosed, connectionClosed:
		return nil, ErrConnectionClosed
	case connectionWaitingToRecvInitReq, connectionWaitingToSendInitReq, connectionWaitingToRecvInitRes:
		return nil, ErrConnectionNotReady
	default:
		return nil, errConnectionUnknownState
	}

	deadline, ok := ctx.Deadline()
	// No deadline was set, we should not support no deadlines.
	if !ok {
		return nil, ErrTimeoutRequired
	}
	timeToLive := deadline.Sub(time.Now())
	if timeToLive <= 0 {
		return nil, ErrTimeout
	}

	requestID := c.NextMessageID()
	mex, err := c.outbound.newExchange(ctx, c.framePool, messageTypeCallReq, requestID, 512)
	if err != nil {
		return nil, err
	}

	// Close may have been called between the time we checked the state and us creating the exchange.
	if state := c.readState(); state != connectionStartClose && state != connectionActive {
		mex.shutdown()
		return nil, ErrConnectionClosed
	}

	if opts := currentCallOptions(ctx); opts != nil {
		// TODO(prashant): Figure out whether we want callOptions as BeginCall argument
		// and as a Context value.
		callOptions = opts
	}

	headers := transportHeaders{
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
	call.statsReporter = c.statsReporter
	call.createStatsTags(c.commonStatsTags)
	call.log = c.log.WithFields(LogField{"Out-Call", requestID})

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

	call.AddBinaryAnnotation(BinaryAnnotation{Key: "cn", Value: call.callReq.Headers[CallerName]})
	call.AddBinaryAnnotation(BinaryAnnotation{Key: "as", Value: call.callReq.Headers[ArgScheme]})
	call.AddAnnotation(AnnotationKeyClientSend)

	response := new(OutboundCallResponse)
	response.startedAt = timeNow()
	response.mex = mex
	response.log = c.log.WithFields(LogField{"Out-Response", requestID})
	response.messageForFragment = func(initial bool) message {
		if initial {
			call.AddAnnotation(AnnotationKeyClientReceive)
			call.Report(call.callReq.Tracing, c.traceReporter)
			return &response.callRes
		}

		return new(callResContinue)
	}
	response.contents = newFragmentingReader(response)
	response.statsReporter = call.statsReporter
	response.commonStatsTags = call.commonStatsTags
	call.response = response
	return call, nil
}

// handleCallRes handles an incoming call req message, forwarding the
// frame to the response channel waiting for it
func (c *Connection) handleCallRes(frame *Frame) bool {
	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
		return true
	}
	return false
}

// handleCallResContinue handles an incoming call res continue message,
// forwarding the frame to the response channel waiting for it
func (c *Connection) handleCallResContinue(frame *Frame) bool {
	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
		return true
	}
	return false
}

// An OutboundCall is an active call to a remote peer.  A client makes a call
// by calling BeginCall on the Channel, writing argument content via
// ArgWriter2() ArgWriter3(), and then reading reading response data via the
// ArgReader2() and ArgReader3() methods on the Response() object.
type OutboundCall struct {
	reqResWriter
	Annotations

	callReq         callReq
	response        *OutboundCallResponse
	statsReporter   StatsReporter
	commonStatsTags map[string]string
}

// Response provides access to the call's response object, which can be used to
// read response arguments
func (call *OutboundCall) Response() *OutboundCallResponse {
	return call.response
}

// createStatsTags creates the common stats tags, if they are not already created.
func (call *OutboundCall) createStatsTags(connectionTags map[string]string) {
	call.commonStatsTags = map[string]string{
		"target-service": call.callReq.Service,
	}
	for k, v := range connectionTags {
		call.commonStatsTags[k] = v
	}
}

// writeOperation writes the operation (arg1) to the call
func (call *OutboundCall) writeOperation(operation []byte) error {
	if len(operation) > maxOperationSize {
		return call.failed(ErrOperationTooLarge)
	}

	// TODO(prashant): Should operation become part of BeginCall so this can use Format directly.
	if call.callReq.Headers[ArgScheme] != HTTP.String() {
		call.commonStatsTags["target-endpoint"] = string(operation)
	}

	call.statsReporter.IncCounter("outbound.calls.send", call.commonStatsTags, 1)
	return NewArgWriter(call.arg1Writer()).Write(operation)
}

// Arg2Writer returns a WriteCloser that can be used to write the second argument.
// The returned writer must be closed once the write is complete.
func (call *OutboundCall) Arg2Writer() (ArgWriter, error) {
	return call.arg2Writer()
}

// Arg3Writer returns a WriteCloser that can be used to write the last argument.
// The returned writer must be closed once the write is complete.
func (call *OutboundCall) Arg3Writer() (ArgWriter, error) {
	return call.arg3Writer()
}

func (call *OutboundCall) doneSending() {}

// An OutboundCallResponse is the response to an outbound call
type OutboundCallResponse struct {
	reqResReader

	callRes callRes

	// startedAt is the time at which the outbound call was started.
	startedAt       time.Time
	statsReporter   StatsReporter
	commonStatsTags map[string]string
}

// ApplicationError returns true if the call resulted in an application level error
// TODO(mmihic): In current implementation, you must have called Arg2Reader before this
// method returns the proper value.  We should instead have this block until the first
// fragment is available, if the first fragment hasn't been received.
func (response *OutboundCallResponse) ApplicationError() bool {
	// TODO(mmihic): Wait for first fragment
	return response.callRes.ResponseCode == responseApplicationError
}

// Format the format of the request from the ArgScheme transport header.
func (response *OutboundCallResponse) Format() Format {
	return Format(response.callRes.Headers[ArgScheme])
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
	errMsg := errorMessage{
		id: frame.Header.ID,
	}
	rbuf := typed.NewReadBuffer(frame.SizedPayload())
	if err := errMsg.read(rbuf); err != nil {
		c.log.Warnf("Unable to read Error frame from %s: %v", c.remotePeerInfo, err)
		c.connectionError(err)
		return
	}

	if errMsg.errCode == ErrCodeProtocol {
		c.log.Warnf("Peer %s reported protocol error: %s", c.remotePeerInfo, errMsg.message)
		c.connectionError(errMsg.AsSystemError())
		return
	}

	if err := c.outbound.forwardPeerFrame(frame); err != nil {
		c.outbound.removeExchange(frame.Header.ID)
	}
}

// doneReading shuts down the message exchange for this call.
// For outgoing calls, the last message is reading the call response.
func (response *OutboundCallResponse) doneReading() {
	if response.ApplicationError() {
		// TODO(prashant): Figure out how to add "type" to tags, which TChannel does not know about.
		response.statsReporter.IncCounter("outbound.calls.app-errors", response.commonStatsTags, 1)
	} else {
		response.statsReporter.IncCounter("outbound.calls.success", response.commonStatsTags, 1)
	}
	latency := timeNow().Sub(response.startedAt)
	response.statsReporter.RecordTimer("outbound.calls.latency", response.commonStatsTags, latency)

	response.mex.shutdown()
}
