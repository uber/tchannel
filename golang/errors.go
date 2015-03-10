package tchannel

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
