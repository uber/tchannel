package tchannel

import (
	"code.uber.internal/infra/mmihic/tchannel-go/binio"
	"io"
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
