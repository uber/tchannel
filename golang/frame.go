package tchannel

import (
	"github.com/uber/tchannel/golang/typed"
	"math"
)

const (
	// MaxFramePayloadSize is the maximum size of the payload for a single frame
	MaxFramePayloadSize = math.MaxUint16

	// FrameHeaderSize is the size of the header element for a frame
	FrameHeaderSize = 16

	// MaxFrameSize is the total maximum size for a frame
	MaxFrameSize = MaxFramePayloadSize + FrameHeaderSize
)

// FrameHeader is the header for a frame, containing the MessageType and size
type FrameHeader struct {
	// The size of the frame, not including the header
	Size uint16

	// The type of message represented by the frame
	messageType messageType

	// Left empty
	reserved1 byte

	// The id of the message represented by the frame
	ID uint32

	// Left empty
	reserved [8]byte
}

// A Frame is a header and payload
type Frame struct {
	// The header for the frame
	Header FrameHeader

	// The payload for the frame
	Payload [MaxFramePayloadSize]byte
}

// SizedPayload returns the slice of the payload actually used, as defined by the header
func (f *Frame) SizedPayload() []byte {
	return f.Payload[:f.Header.Size]
}

func (fh *FrameHeader) read(r typed.ReadBuffer) error {
	var err error
	fh.Size, err = r.ReadUint16()
	if err != nil {
		return err
	}

	msgType, err := r.ReadByte()
	if err != nil {
		return err
	}

	fh.messageType = messageType(msgType)

	if _, err := r.ReadByte(); err != nil {
		return err
	}

	fh.ID, err = r.ReadUint32()
	if err != nil {
		return err
	}

	if _, err := r.ReadBytes(len(fh.reserved)); err != nil {
		return err
	}

	return nil
}

func (fh *FrameHeader) write(w typed.WriteBuffer) error {
	if err := w.WriteUint16(fh.Size); err != nil {
		return err
	}

	if err := w.WriteByte(byte(fh.messageType)); err != nil {
		return err
	}

	if err := w.WriteByte(fh.reserved1); err != nil {
		return err
	}

	if err := w.WriteUint32(fh.ID); err != nil {
		return err
	}

	if err := w.WriteBytes(fh.reserved[:]); err != nil {
		return err
	}

	return nil
}
