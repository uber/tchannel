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

func (fh *FrameHeader) read(r typed.Reader) error {
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

func (fh *FrameHeader) write(w typed.Writer) error {
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

// A Frame, consisting of a header and a payload
type Frame struct {
	pool    FrameBufferPool
	Header  FrameHeader
	Payload []byte
}

// Implements the io.Closer interface
func (f Frame) Close() error {
	f.pool.Release(f.Payload)
	return nil
}

// Pool managing frame buffers.  We know the max size of a frame, so we can more efficiently pool these
type FrameBufferPool interface {
	Get(size int) []byte
	Release(b []byte)
}

type defaultFrameBufferPool struct{}

func (fp *defaultFrameBufferPool) Get(size int) []byte { return make([]byte, size) }
func (fp *defaultFrameBufferPool) Release(b []byte)    {}

var (
	DefaultFrameBufferPool = &defaultFrameBufferPool{}
)

// Allows reading Frames off an underlying io.Reader
type FrameReader struct {
	pool           FrameBufferPool
	frameHeaderBuf [FrameHeaderSize]byte
	r              io.Reader
}

// Creates a new FrameReader on top of the provided io.Reader
func NewFrameReader(r io.Reader) *FrameReader {
	return NewFrameReaderWithPool(r, DefaultFrameBufferPool)
}

func NewFrameReaderWithPool(r io.Reader, pool FrameBufferPool) *FrameReader {
	return &FrameReader{r: r, pool: pool}
}

// Reads the next Frame from the stream.
func (r *FrameReader) ReadFrame() (Frame, error) {
	frame := Frame{}

	if _, err := io.ReadFull(r.r, r.frameHeaderBuf[:]); err != nil {
		return frame, err
	}

	br := typed.NewReader(r.frameHeaderBuf[:])
	if err := frame.Header.read(br); err != nil {
		return frame, err
	}

	frame.Payload = r.pool.Get(int(frame.Header.Size))
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
	var fh [FrameHeaderSize]byte
	tw := typed.NewWriter(fh[:])
	if err := f.Header.write(tw); err != nil {
		return err
	}

	if _, err := w.w.Write(fh[:]); err != nil {
		return err
	}

	if _, err := w.w.Write(f.Payload); err != nil {
		return err
	}

	return nil
}
