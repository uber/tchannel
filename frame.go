package tchannel

import (
	"bytes"
	"code.uber.internal/infra/mmihic/tchannel-go/binio"
	"io"
)

// Header for frames
type FrameHeader struct {
	// The size of the frame, not including the header
	Size uint32

	// The id of the message represented by the frame
	Id uint32

	// The type of message represented by the frame
	Type MessageType

	// The flags for the frame, notably whether this is the final fragment or not
	Flags    byte
	reserved [6]byte
}

func (fh *FrameHeader) read(r binio.Reader) error {
	var err error
	fh.Size, err = r.ReadUint32()
	if err != nil {
		return err
	}

	fh.Id, err = r.ReadUint32()
	if err != nil {
		return err
	}

	msgType, err := r.ReadByte()
	if err != nil {
		return err
	}

	fh.Type = MessageType(msgType)

	fh.Flags, err = r.ReadByte()
	if err != nil {
		return err
	}

	if err := r.ReadFull(fh.reserved[:]); err != nil {
		return err
	}

	return nil
}

func (fh *FrameHeader) write(w binio.Writer) error {
	if err := w.WriteUint32(fh.Size); err != nil {
		return err
	}

	if err := w.WriteUint32(fh.Id); err != nil {
		return err
	}

	if err := w.WriteByte(byte(fh.Type)); err != nil {
		return err
	}

	if err := w.WriteByte(fh.Flags); err != nil {
		return err
	}

	if err := w.WriteBytes(fh.reserved[:]); err != nil {
		return err
	}

	return nil
}

// return true if the FrameHeader is for the final fragment of the message
func (fh *FrameHeader) FinalFragment() bool {
	return (fh.Flags & FlagMoreFragments) == 0
}

// Indicates that there are more fragments coming after this frame
func (fh *FrameHeader) SetMoreFragments() {
	fh.Flags |= FlagMoreFragments
}

// Indicates that this frame is the final fragment for the message
func (fh *FrameHeader) SetFinalFragment() {
	fh.Flags &= ^FlagMoreFragments
}

const (
	FlagMoreFragments byte = 0x01
)

const frameHeaderLen = 16

// A Frame, consisting of a header and a payload
type Frame struct {
	Header  FrameHeader
	Payload []byte
}

// Allows reading Frames off an underlying io.Reader
type FrameReader struct {
	frameHeaderBuf [frameHeaderLen]byte
	r              io.Reader
}

// Creates a new FrameReader on top of the provided io.Reader
func NewFrameReader(r io.Reader) *FrameReader {
	return &FrameReader{r: r}
}

// Reads the next Frame from the stream.
func (r *FrameReader) ReadFrame() (Frame, error) {
	frame := Frame{}

	if _, err := io.ReadFull(r.r, r.frameHeaderBuf[:]); err != nil {
		return frame, err
	}

	br := binio.NewReader(bytes.NewReader(r.frameHeaderBuf[:]))
	if err := frame.Header.read(br); err != nil {
		return frame, err
	}

	// TODO(mmihic): Provide a way of managing memory for the payload buffers
	frame.Payload = make([]byte, int(frame.Header.Size))
	if _, err := io.ReadFull(r.r, frame.Payload); err != nil {
		return frame, err
	}

	return frame, nil
}

// Writer for Frames
type FrameWriter struct {
	w io.Writer
}

// Creates a new FrameWriter around a frame
func NewFrameWriter(w io.Writer) *FrameWriter {
	return &FrameWriter{w: w}
}

// Writes a frame to the underlying stream
func (w *FrameWriter) WriteFrame(f *Frame) error {
	bw := binio.NewWriterSize(w.w, frameHeaderLen)
	if err := f.Header.write(bw); err != nil {
		return err
	}

	if err := bw.Flush(); err != nil {
		return err
	}

	if _, err := w.w.Write(f.Payload); err != nil {
		return err
	}

	return nil
}
