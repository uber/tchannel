package tchannel

import (
	"code.uber.internal/infra/mmihic/tchannel-go/typed"
	"io"
	"time"
)

// Type of message
type MessageType byte

const (
	MessageTypeInitReq         MessageType = 0x01
	MessageTypeInitRes         MessageType = 0x02
	MessageTypeCallReq         MessageType = 0x03
	MessageTypeCallRes         MessageType = 0x04
	MessageTypeCallReqContinue MessageType = 0x13
	MessageTypeCallResContinue MessageType = 0x14
	MessageTypeError           MessageType = 0xFF
)

var messageTypeNames = map[MessageType]string{
	MessageTypeInitReq:         "InitReq",
	MessageTypeInitRes:         "InitRes",
	MessageTypeCallReq:         "CallReq",
	MessageTypeCallReqContinue: "CallReqContinue",
	MessageTypeCallRes:         "CallRes",
	MessageTypeCallResContinue: "CallResContinue",
	MessageTypeError:           "Error",
}

func (t MessageType) String() string {
	return messageTypeNames[t]
}

// Base interface for messages.  Has an id and a type, and knows how to read and write onto a binary stream
type Message interface {
	// The id of the message
	Id() uint32

	// The type of the message
	Type() MessageType

	read(r typed.ReadBuffer) error
	write(r typed.WriteBuffer) error
}

// Parameters to an InitReq/InitRes
type InitParams map[string]string

// Standard init params
const (
	InitParamHostPort    = "host_port"
	InitParamProcessName = "process_name"
)

type initMessage struct {
	id         uint32
	Version    uint16
	InitParams InitParams
}

func (m *initMessage) read(r typed.ReadBuffer) error {
	var err error
	m.Version, err = r.ReadUint16()
	if err != nil {
		return err
	}

	m.InitParams = InitParams{}
	for {
		klen, err := r.ReadUint16()
		if err == io.EOF {
			return nil
		}

		k, err := r.ReadString(int(klen))
		if err != nil {
			return err
		}

		vlen, err := r.ReadUint16()
		if err != nil {
			return err
		}

		v, err := r.ReadString(int(vlen))
		if err != nil {
			return err
		}

		m.InitParams[k] = v
	}
}

func (m *initMessage) write(w typed.WriteBuffer) error {
	if err := w.WriteUint16(m.Version); err != nil {
		return err
	}

	for k, v := range m.InitParams {
		if err := w.WriteUint16(uint16(len(k))); err != nil {
			return err
		}

		if err := w.WriteString(k); err != nil {
			return err
		}

		if err := w.WriteUint16(uint16(len(v))); err != nil {
			return err
		}

		if err := w.WriteString(v); err != nil {
			return err
		}
	}

	return nil
}

func (m *initMessage) Id() uint32 {
	return m.id
}

// An InitReq, containing context information to exchange with peer
type InitReq struct {
	initMessage
}

func (m *InitReq) Type() MessageType { return MessageTypeInitReq }

// An InitRes, containing context information to return to intiating peer
type InitRes struct {
	initMessage
}

func (m *InitRes) Type() MessageType { return MessageTypeInitRes }

// Headers passed as part of a CallReq/CallRes
type CallHeaders map[string]string

func (ch CallHeaders) read(r typed.ReadBuffer) error {
	nh, err := r.ReadByte()
	if err != nil {
		return err
	}

	for i := 0; i < int(nh); i++ {
		klen, err := r.ReadByte()
		if err != nil {
			return err
		}

		k, err := r.ReadString(int(klen))
		if err != nil {
			return err
		}

		vlen, err := r.ReadByte()
		if err != nil {
			return err
		}

		v, err := r.ReadString(int(vlen))
		if err != nil {
			return err
		}

		ch[k] = v
	}

	return nil
}

func (ch CallHeaders) write(w typed.WriteBuffer) error {
	if err := w.WriteByte(byte(len(ch))); err != nil {
		return err
	}

	for k, v := range ch {
		if err := w.WriteByte(byte(len(k))); err != nil {
			return err
		}

		if err := w.WriteString(k); err != nil {
			return err
		}

		if err := w.WriteByte(byte(len(v))); err != nil {
			return err
		}

		if err := w.WriteString(v); err != nil {
			return err
		}
	}

	return nil
}

// Zipkin tracing info
type Tracing struct {
	// The outer trace id.  Established at the outermost edge service and propagated through all calls
	TraceId uint64

	// The id of the parent span in this call graph
	ParentId uint64

	// The id of this specific RPC
	SpanId uint64
}

// A CallReq for service
type CallReq struct {
	id         uint32
	TimeToLive time.Duration
	Tracing    Tracing
	TraceFlags byte
	Headers    CallHeaders
	Service    []byte
}

func (m *CallReq) Id() uint32        { return m.id }
func (m *CallReq) Type() MessageType { return MessageTypeCallReq }
func (m *CallReq) read(r typed.ReadBuffer) error {
	var err error
	ttl, err := r.ReadUint32()
	if err != nil {
		return err
	}

	m.TimeToLive = time.Duration(ttl) * time.Millisecond
	m.Tracing.TraceId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.Tracing.ParentId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.Tracing.SpanId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.TraceFlags, err = r.ReadByte()
	if err != nil {
		return err
	}

	m.Headers = CallHeaders{}
	if err := m.Headers.read(r); err != nil {
		return err
	}

	serviceNameLen, err := r.ReadUint16()
	if err != nil {
		return err
	}

	if m.Service, err = r.ReadBytes(int(serviceNameLen)); err != nil {
		return err
	}

	return nil
}

func (m *CallReq) write(w typed.WriteBuffer) error {
	if err := w.WriteUint32(uint32(m.TimeToLive.Seconds() * 1000)); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.TraceId); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.ParentId); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.SpanId); err != nil {
		return err
	}

	if err := w.WriteByte(m.TraceFlags); err != nil {
		return err
	}

	if err := m.Headers.write(w); err != nil {
		return err
	}

	if err := w.WriteUint16(uint16(len(m.Service))); err != nil {
		return err
	}

	if err := w.WriteBytes(m.Service); err != nil {
		return err
	}

	return nil
}

// A continuatin of a previous CallReq
type CallReqContinue struct {
	id uint32
}

func (c *CallReqContinue) Id() uint32                      { return c.id }
func (c *CallReqContinue) Type() MessageType               { return MessageTypeCallReqContinue }
func (c *CallReqContinue) read(r typed.ReadBuffer) error   { return nil }
func (c *CallReqContinue) write(w typed.WriteBuffer) error { return nil }

// ResponseCode to a CallReq
type ResponseCode byte

const (
	ResponseOK               ResponseCode = 0x00
	ResponseApplicationError ResponseCode = 0x01
)

// A response to a CallReq
type CallRes struct {
	id           uint32
	ResponseCode ResponseCode
	Tracing      Tracing
	TraceFlags   byte
	Headers      CallHeaders
}

func (m *CallRes) Id() uint32        { return m.id }
func (m *CallRes) Type() MessageType { return MessageTypeCallRes }

func (m *CallRes) read(r typed.ReadBuffer) error {
	var err error
	c, err := r.ReadByte()
	if err != nil {
		return err
	}
	m.ResponseCode = ResponseCode(c)
	m.Tracing.TraceId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.Tracing.ParentId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.Tracing.SpanId, err = r.ReadUint64()
	if err != nil {
		return err
	}

	m.TraceFlags, err = r.ReadByte()
	if err != nil {
		return err
	}

	m.Headers = CallHeaders{}
	if err := m.Headers.read(r); err != nil {
		return err
	}

	return nil
}

func (m *CallRes) write(w typed.WriteBuffer) error {
	if err := w.WriteByte(byte(m.ResponseCode)); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.TraceId); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.ParentId); err != nil {
		return err
	}

	if err := w.WriteUint64(m.Tracing.SpanId); err != nil {
		return err
	}

	if err := w.WriteByte(m.TraceFlags); err != nil {
		return err
	}

	if err := m.Headers.write(w); err != nil {
		return err
	}

	return nil
}

// A continuation of a previous CallRes
type CallResContinue struct {
	id uint32
}

func (c *CallResContinue) Id() uint32                      { return c.id }
func (c *CallResContinue) Type() MessageType               { return MessageTypeCallResContinue }
func (c *CallResContinue) read(r typed.ReadBuffer) error   { return nil }
func (c *CallResContinue) write(w typed.WriteBuffer) error { return nil }

// An Error message, a system-level error response to a request or a protocol level error
type ErrorMessage struct {
	id                uint32
	ErrorCode         SystemErrorCode
	OriginalMessageId uint32
	Message           string
}

func (m *ErrorMessage) Id() uint32        { return m.id }
func (m *ErrorMessage) Type() MessageType { return MessageTypeError }
func (m *ErrorMessage) read(r typed.ReadBuffer) error {
	errCode, err := r.ReadByte()
	if err != nil {
		return err
	}

	m.ErrorCode = SystemErrorCode(errCode)

	if m.OriginalMessageId, err = r.ReadUint32(); err != nil {
		return err
	}

	msgSize, err := r.ReadUint16()
	if err != nil {
		return err
	}

	if m.Message, err = r.ReadString(int(msgSize)); err != nil {
		return err
	}

	return nil
}

func (m *ErrorMessage) write(w typed.WriteBuffer) error {
	if err := w.WriteByte(byte(m.ErrorCode)); err != nil {
		return err
	}

	if err := w.WriteUint32(m.OriginalMessageId); err != nil {
		return err
	}

	if err := w.WriteUint16(uint16(len(m.Message))); err != nil {
		return err
	}

	if err := w.WriteString(m.Message); err != nil {
		return err
	}

	return nil
}

func (m ErrorMessage) AsSystemError() error {
	// TODO(mmihic): Might be nice to return one of the well defined error types
	return NewSystemError(m.ErrorCode, m.Message)
}
