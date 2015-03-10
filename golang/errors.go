package tchannel

const (
	// Message id for protocol level errors
	InvalidMessageID uint32 = 0xFFFFFFFF
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
