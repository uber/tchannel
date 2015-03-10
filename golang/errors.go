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

const (
	// Message id for protocol level errors
	invalidMessageID uint32 = 0xFFFFFFFF
)

// A SystemErrorCode indicates how a caller should handle a system error returned from a peer
type SystemErrorCode byte

const (
	// ErrorCodeInvalid is an invalid error code, and should not be used
	ErrorCodeInvalid SystemErrorCode = 0x00

	// ErrorCodeTimeout indicates the peer timed out.  Callers can retry the request
	// on another peer if the request is safe to retry.
	ErrorCodeTimeout SystemErrorCode = 0x01

	// ErrorCodeCancelled indicates that the request was cancelled on the peer.  Callers
	// can retry the request on the same or another peer if the request is safe to retry
	ErrorCodeCancelled SystemErrorCode = 0x02

	// ErrorCodeBusy indicates that the request was not dispatched because the peer
	// was too busy to handle it.  Callers can retry the request on another peer, and should
	// reweight their connections to direct less traffic to this peer until it recovers.
	ErrorCodeBusy SystemErrorCode = 0x03

	// ErrorCodeDeclined indicates that the request not dispatched because the peer
	// declined to handle it, typically because the peer is not yet ready to handle it.
	// Callers can retry the request on another peer, but should not reweight their connections
	// and should continue to send traffic to this peer.
	ErrorCodeDeclined SystemErrorCode = 0x04

	// ErrorCodeUnexpected indicates that the request failed for an unexpected reason, typically
	// a crash or other unexpected handling.  The request may have been processed before the failure;
	// callers should retry the request on this or another peer only if the request is safe to retry
	ErrorCodeUnexpected SystemErrorCode = 0x05

	// ErrorCodeBadRequest indicates that the request was malformed, and could not be processed.
	// Callers should not bother to retry the request, as there
	ErrorCodeBadRequest SystemErrorCode = 0x06

	// ErrorCodeProtocol indincates a fatal protocol error communicating with the peer.  The connection
	// will be terminated.
	ErrorCodeProtocol SystemErrorCode = 0xFF
)

var (
	// ErrServerBusy is a SystemError indicating the server is busy
	ErrServerBusy = NewSystemError(ErrorCodeBusy, "server busy")

	// ErrRequestCancelled is a SystemError indicating the request has been cancelled on the peer
	ErrRequestCancelled = NewSystemError(ErrorCodeCancelled, "request cancelled")

	// ErrTimeout is a SytemError indicating the request has timed out
	ErrTimeout = NewSystemError(ErrorCodeTimeout, "timeout")
)

// A SystemError is a system-level error, containing an error code and message
// TODO(mmihic): Probably we want to hide this interface, and let application code
// just deal with standard raw errors.
type SystemError struct {
	code SystemErrorCode
	msg  string
}

// NewSystemError defines a new SystemError with a code and message
func NewSystemError(code SystemErrorCode, msg string) error {
	return SystemError{code: code, msg: msg}
}

// Error returns the SystemError message, conforming to the error interface
func (se SystemError) Error() string {
	return se.msg
}

// Returns the SystemError code, for sending to a peer
func (se SystemError) errorCode() SystemErrorCode {
	return se.code
}

// GetSystemErrorCode returns the code to report for the given error.  If the error is a SystemError, we can
// get the code directly.  Otherwise treat it as an unexpected error
func GetSystemErrorCode(err error) SystemErrorCode {
	if se, ok := err.(SystemError); ok {
		return se.errorCode()
	}

	return ErrorCodeUnexpected
}
