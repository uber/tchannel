package tchannel

import (
	"code.uber.internal/personal/mmihic/tchannel-go/typed"
	"math"
)

const (
	MaxFramePayloadSize = math.MaxUint16
	FrameHeaderSize     = 16
	MaxFrameSize        = MaxFramePayloadSize + FrameHeaderSize
)

// Header for frames
type FrameHeader struct {
	// The size of the frame, not including the header
	Size uint16

	// The type of message represented by the frame
	Type MessageType

	// Left empty
	reserved1 byte

	// The id of the message represented by the frame
	Id uint32

	// Left empty
	reserved [8]byte
}

// A frame, consisting of a header and a payload
type Frame struct {
	Header  FrameHeader
	Payload [MaxFramePayloadSize]byte
}

// Returns the slice of the payload actually used, as defined by the header
func (f *Frame) SizedPayload() []byte {
	return f.Payload[:f.Header.Size]
}

func (fh *FrameHeader) read(r typed.ReadBuffer) error {
	var err error
	fh.Size, err = r.ReadUint16()
	if err != nil {
		return NewReadIOError("frame size", err)
	}

	msgType, err := r.ReadByte()
	if err != nil {
		return NewReadIOError("frame type", err)
	}

	fh.Type = MessageType(msgType)

	if _, err := r.ReadByte(); err != nil {
		return NewReadIOError("frame reserved1", err)
	}

	fh.Id, err = r.ReadUint32()
	if err != nil {
		return NewReadIOError("frame msg id", err)
	}

	if _, err := r.ReadBytes(len(fh.reserved)); err != nil {
		return NewReadIOError("frame reserved1", err)
	}

	return nil
}

func (fh *FrameHeader) write(w typed.WriteBuffer) error {
	if err := w.WriteUint16(fh.Size); err != nil {
		return NewWriteIOError("frame size", err)
	}

	if err := w.WriteByte(byte(fh.Type)); err != nil {
		return NewWriteIOError("frame type", err)
	}

	if err := w.WriteByte(fh.reserved1); err != nil {
		return NewWriteIOError("frame reserved1", err)
	}

	if err := w.WriteUint32(fh.Id); err != nil {
		return NewWriteIOError("frame msg id", err)
	}

	if err := w.WriteBytes(fh.reserved[:]); err != nil {
		return NewWriteIOError("frame reserved2", err)
	}

	return nil
}
