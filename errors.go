package tchannel

import (
	"io"
)

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
