package tchannel

import (
	"code.uber.internal/infra/mmihic/tchannel-go/typed"
	"io"
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

// Allows reading Frames off an underlying io.Reader
type FrameReader struct {
	r io.Reader
}

// Creates a new FrameReader on top of the provided io.Reader
func NewFrameReader(r io.Reader) *FrameReader {
	return &FrameReader{r}
}

// Reads the next Frame from the stream.
func (r *FrameReader) ReadFrame(fh *FrameHeader, payload typed.ReadBuffer) error {
	if _, err := payload.FillFrom(r.r, FrameHeaderSize); err != nil {
		return err
	}

	if err := fh.read(payload); err != nil {
		return err
	}

	if _, err := payload.FillFrom(r.r, int(fh.Size)); err != nil {
		return err
	}

	return nil
}

// Writer for Frames
type FrameWriter struct {
	w         io.Writer
	headerBuf typed.WriteBuffer
}

// Creates a new FrameWriter around a frame
func NewFrameWriter(w io.Writer) *FrameWriter {
	return &FrameWriter{w: w, headerBuf: typed.NewWriteBufferWithSize(FrameHeaderSize)}
}

// Writes a frame to the underlying stream
func (w *FrameWriter) WriteFrame(fh FrameHeader, payload typed.WriteBuffer) error {
	w.headerBuf.Reset()

	if err := fh.write(w.headerBuf); err != nil {
		return err
	}

	if _, err := w.headerBuf.FlushTo(w.w); err != nil {
		return err
	}

	if _, err := payload.FlushTo(w.w); err != nil {
		return err
	}

	return nil
}
