package typed

import (
	"encoding/binary"
	"errors"
	"io"
)

var (
	ErrInsufficientBuffer = errors.New("buffer is too small")
	ErrBufferFull         = errors.New("no more room in buffer")
)

// A typed.ReadBuffer is a wrapper around an underlying []byte with methods to read from
// that buffer in big-endian format.
type ReadBuffer interface {
	// Reads the next byte from the buffer
	ReadByte() (byte, error)

	// Read n bytes from the buffer
	ReadBytes(n int) ([]byte, error)

	// Read a string of length n from the buffer
	ReadString(n int) (string, error)

	// Read a 16-bit big endian value from the buffer
	ReadUint16() (uint16, error)

	// Reads a 32-bit big endian value from the buffer
	ReadUint32() (uint32, error)

	// Reads a 64-bit big endian value from the buffer
	ReadUint64() (uint64, error)

	// Returns the number of bytes remaining in the buffer
	BytesRemaining() int

	// Fills the buffer from a given reader, up the amount specified
	FillFrom(ior io.Reader, n int) (int, error)
}

// A typed.WriteBuffer is a wrapper around an underlying []byte with methods to write to
// that buffer in big-endian format.  The buffer is of fixed size, and does not grow.
type WriteBuffer interface {
	// Writes a byte to the buffer
	WriteByte(n byte) error

	// Writes a slice of bytes to the buffer
	WriteBytes(b []byte) error

	// Writes a 16-bit big endian value to the buffer
	WriteUint16(n uint16) error

	// Writes a 32-bit big endian value to the buffer
	WriteUint32(n uint32) error

	// Writes a 64-bit big endian value to the buffer
	WriteUint64(n uint64) error

	// Writes a string to the buffer
	WriteString(s string) error

	// Returns the amount of free buffer space remaining
	BytesRemaining() int

	// Returns the number of bytes written to the buffer
	BytesWritten() int

	// Flushes the buffer's content to the given Writer
	FlushTo(w io.Writer) (int, error)

	// Resets the buffer to a clean state for writing
	Reset()
}

func NewReadBufferWithSize(size int) ReadBuffer {
	return &readBuffer{buffer: make([]byte, size), remaining: nil}
}

type readBuffer struct {
	buffer    []byte
	remaining []byte
}

func (r *readBuffer) ReadByte() (byte, error) {
	if len(r.remaining) == 0 {
		return 0, io.EOF
	}

	b := r.remaining[0]
	r.remaining = r.remaining[1:]
	return b, nil
}

func (r *readBuffer) ReadBytes(n int) ([]byte, error) {
	if len(r.remaining) < n {
		b := r.remaining
		r.remaining = nil
		return b, io.EOF
	}

	b := r.remaining[0:n]
	r.remaining = r.remaining[n:]
	return b, nil
}

func (r *readBuffer) ReadString(n int) (string, error) {
	b, err := r.ReadBytes(n)
	if err != nil {
		return "", err
	}

	// TODO(mmihic): This creates a copy, which sucks
	return string(b), nil
}

func (r *readBuffer) ReadUint16() (uint16, error) {
	b, err := r.ReadBytes(2)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint16(b), nil
}

func (r *readBuffer) ReadUint32() (uint32, error) {
	b, err := r.ReadBytes(4)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint32(b), nil
}

func (r *readBuffer) ReadUint64() (uint64, error) {
	b, err := r.ReadBytes(8)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint64(b), nil
}

func (r *readBuffer) BytesRemaining() int {
	return len(r.remaining)
}

func (r *readBuffer) FillFrom(ior io.Reader, n int) (int, error) {
	if len(r.buffer) < n {
		return 0, ErrInsufficientBuffer
	}

	r.remaining = r.buffer[:n]
	return ior.Read(r.remaining)
}

func NewWriteBuffer(buffer []byte) WriteBuffer {
	return &writeBuffer{buffer: buffer, remaining: buffer}
}

func NewWriteBufferWithSize(size int) WriteBuffer {
	return NewWriteBuffer(make([]byte, size))
}

type writeBuffer struct {
	buffer    []byte
	remaining []byte
}

func (w *writeBuffer) WriteByte(n byte) error {
	if len(w.remaining) == 0 {
		return ErrBufferFull
	}

	w.remaining[0] = n
	w.remaining = w.remaining[1:]
	return nil
}

func (w *writeBuffer) WriteBytes(b []byte) error {
	inbuf, err := w.reserve(len(b))
	if err != nil {
		return err
	}

	copy(inbuf, b)
	return nil
}

func (w *writeBuffer) WriteUint16(n uint16) error {
	b, err := w.reserve(2)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint16(b, n)
	return nil
}

func (w *writeBuffer) WriteUint32(n uint32) error {
	b, err := w.reserve(4)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint32(b, n)
	return nil
}

func (w *writeBuffer) WriteUint64(n uint64) error {
	b, err := w.reserve(8)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint64(b, n)
	return nil
}

func (w *writeBuffer) WriteString(s string) error {
	// NB(mmihic): Don't just call WriteBytes; that will make a double copy of the string due to the cast
	b, err := w.reserve(len(s))
	if err != nil {
		return err
	}

	copy(b, s)
	return nil
}

func (w *writeBuffer) reserve(n int) ([]byte, error) {
	if len(w.remaining) < n {
		return nil, ErrBufferFull
	}

	b := w.remaining[0:n]
	w.remaining = w.remaining[n:]
	return b, nil
}

func (w *writeBuffer) BytesRemaining() int {
	return len(w.remaining)
}

func (w *writeBuffer) FlushTo(iow io.Writer) (int, error) {
	dirty := w.buffer[0:w.BytesWritten()]
	return iow.Write(dirty)
}

func (w *writeBuffer) BytesWritten() int {
	return len(w.buffer) - len(w.remaining)
}

func (w *writeBuffer) Reset() {
	w.remaining = w.buffer
}
