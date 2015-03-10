package tchannel

import (
	"fmt"
	"io"
)

const (
	// Message id for protocol level errors
	InvalidMessageId uint32 = 0xFFFFFFFF
)

// Recognized system error codes
type SystemErrorCode byte

const (
	ErrorCodeInvalid    SystemErrorCode = 0x00
	ErrorCodeTimeout    SystemErrorCode = 0x01
	ErrorCodeCancelled  SystemErrorCode = 0x02
	ErrorCodeBusy       SystemErrorCode = 0x03
	ErrorCodeDeclined   SystemErrorCode = 0x04
	ErrorCodeUnexpected SystemErrorCode = 0x05
	ErrorCodeBadRequest SystemErrorCode = 0x06
	ErrorCodeProtocol   SystemErrorCode = 0xFF
)

var (
	ErrServerBusy       = NewSystemError(ErrorCodeBusy, "server busy")
	ErrRequestCancelled = NewSystemError(ErrorCodeCancelled, "request cancelled")
	ErrTimeout          = NewSystemError(ErrorCodeTimeout, "timeout")
)

// A system error, containing the error code along with the message
type SystemError struct {
	code SystemErrorCode
	msg  string
}

// Defines a new SystemError
func NewSystemError(code SystemErrorCode, msg string) error {
	return SystemError{code: code, msg: msg}
}

// Returns the SystemError message, conforming to the error interface
func (se SystemError) Error() string {
	return se.msg
}

// Returns the SystemError code, for sending to a peer
func (se SystemError) errorCode() SystemErrorCode {
	return se.code
}

// Gets the system error code to report for the given error.  If the error is a SystemError, we can
// get the code directly.  Otherwise treat it as an unexpected error
func GetSystemErrorCode(err error) SystemErrorCode {
	if se, ok := err.(SystemError); ok {
		return se.errorCode()
	}

	return ErrorCodeUnexpected
}

// An underlying IOError, containing additional context about the operation that failed
type IOError struct {
	msg string
	err error
}

// Creates a new IOError for reading a part of a message
func NewReadIOError(part string, err error) error {
	return IOError{msg: fmt.Sprintf("error reading %s: %v", part, err), err: err}
}

// Creates a new IOError for writing a part of a message
func NewWriteIOError(part string, err error) error {
	return IOError{msg: fmt.Sprintf("error writing %s: %v", part, err), err: err}
}

// Implements the Error interface
func (err IOError) Error() string {
	return err.msg
}

// Provides access to the underlying Error
func (err IOError) Underlying() error {
	return err.err
}

// true if the given error represents an EOF condition
func EOF(err error) bool {
	if err == io.EOF {
		return true
	}

	if ioerr, ok := err.(IOError); ok {
		return EOF(ioerr.Underlying())
	}

	return false
}
