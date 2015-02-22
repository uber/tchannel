package tchannel

import (
	"code.uber.internal/infra/mmihic/tchannel-go/binio"
	"io"
	"time"
)

// Type of message
type MessageType byte

const (
	MessageTypeInitReq MessageType = 0x01
	MessageTypeInitRes MessageType = 0x02
	MessageTypeCallReq MessageType = 0x03
	MessageTypeCallRes MessageType = 0x04
	MessageTypeError   MessageType = 0xFF
)

var messageTypeNames = map[MessageType]string{
	MessageTypeInitReq: "InitReq",
	MessageTypeInitRes: "InitRes",
	MessageTypeCallReq: "CallReq",
	MessageTypeCallRes: "CallRes",
	MessageTypeError:   "Error",
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

	read(r binio.Reader) error
	write(r binio.Writer) error
}

// Parameters to an InitReq/InitRes
type InitParams map[string]string

type initMessage struct {
	id         uint32
	Version    uint16
	InitParams InitParams
}

func (m *initMessage) read(r binio.Reader) error {
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

func (m *initMessage) write(w binio.Writer) error {
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

type InitReq struct {
	initMessage
}

func (m *InitReq) Type() MessageType { return MessageTypeInitReq }

type InitRes struct {
	initMessage
}

func (m *InitRes) Type() MessageType { return MessageTypeInitRes }

// Headers passed as part of a CallReq/CallRes
type CallHeaders map[string]string

func (ch CallHeaders) read(r binio.Reader) error {
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

func (ch CallHeaders) write(w binio.Writer) error {
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

type Tracing struct {
	TraceId  uint64
	ParentId uint64
	SpanId   uint64
}

type CallReq struct {
	id         uint32
	TimeToLive time.Duration
	Tracing    Tracing
	TraceFlags byte
	Headers    CallHeaders
	Service    []byte
	Arg1       []byte
	Arg2       []byte
	Arg3       []byte
}

func (m *CallReq) Id() uint32        { return m.id }
func (m *CallReq) Type() MessageType { return MessageTypeCallReq }
func (m *CallReq) read(r binio.Reader) error {
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

	m.Service, err = readArg(r)
	if err != nil {
		return err
	}

	m.Arg1, err = readArg(r)
	if err != nil {
		return err
	}

	m.Arg2, err = readArg(r)
	if err != nil {
		return err
	}

	m.Arg3, err = readArg(r)
	if err != nil {
		return err
	}
	return nil
}

func (m *CallReq) write(w binio.Writer) error {
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

	if err := writeArg(m.Service, w); err != nil {
		return err
	}

	if err := writeArg(m.Arg1, w); err != nil {
		return err
	}

	if err := writeArg(m.Arg2, w); err != nil {
		return err
	}

	if err := writeArg(m.Arg3, w); err != nil {
		return err
	}
	return nil
}

type ResponseCode byte

const (
	OK                   ResponseCode = 0x00
	Timeout              ResponseCode = 0x01
	Cancelled            ResponseCode = 0x02
	ServiceBusy          ResponseCode = 0x03
	SoftApplicationError ResponseCode = 0x04
	HardApplicationError ResponseCode = 0x05
)

func (c ResponseCode) CanRetry() bool {
	switch c {
	case ServiceBusy, SoftApplicationError:
		return true
	default:
		return false
	}
}

type CallRes struct {
	id           uint32
	ResponseCode ResponseCode
	Headers      CallHeaders
	Arg1         []byte
	Arg2         []byte
	Arg3         []byte
}

func (m *CallRes) Id() uint32        { return m.id }
func (m *CallRes) Type() MessageType { return MessageTypeCallRes }

func (m *CallRes) read(r binio.Reader) error {
	c, err := r.ReadByte()
	if err != nil {
		return err
	}
	m.ResponseCode = ResponseCode(c)
	m.Headers = CallHeaders{}
	if err := m.Headers.read(r); err != nil {
		return err
	}

	m.Arg1, err = readArg(r)
	if err != nil {
		return err
	}

	m.Arg2, err = readArg(r)
	if err != nil {
		return err
	}

	m.Arg3, err = readArg(r)
	if err != nil {
		return err
	}

	return nil
}

func (m *CallRes) write(w binio.Writer) error {
	if err := w.WriteByte(byte(m.ResponseCode)); err != nil {
		return err
	}

	if err := m.Headers.write(w); err != nil {
		return err
	}

	if err := writeArg(m.Arg1, w); err != nil {
		return err
	}

	if err := writeArg(m.Arg2, w); err != nil {
		return err
	}

	if err := writeArg(m.Arg3, w); err != nil {
		return err
	}

	return nil
}

func writeArg(arg []byte, w binio.Writer) error {
	if err := w.WriteUint32(uint32(len(arg))); err != nil {
		return err
	}

	return w.WriteBytes(arg)
}

func readArg(r binio.Reader) ([]byte, error) {
	l, err := r.ReadUint32()
	if err != nil {
		return nil, err
	}

	return r.ReadBytes(int(l))
}
