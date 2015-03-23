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
type ReadBuffer struct {
	buffer    []byte
	remaining []byte
}

// NewReadBuffer returns a ReadBuffer wrapping a byte slice
func NewReadBuffer(buffer []byte) *ReadBuffer {
	return &ReadBuffer{buffer: buffer, remaining: buffer}
}

// NewReadBufferWithSize returns a ReadBuffer with a given capacity
func NewReadBufferWithSize(size int) *ReadBuffer {
	return &ReadBuffer{buffer: make([]byte, size), remaining: nil}
}

// ReadByte reads the next byte from the buffer
func (r *ReadBuffer) ReadByte() (byte, error) {
	if len(r.remaining) == 0 {
		return 0, io.EOF
	}

	b := r.remaining[0]
	r.remaining = r.remaining[1:]
	return b, nil
}

// ReadBytes returns the next n bytes from the buffer
func (r *ReadBuffer) ReadBytes(n int) ([]byte, error) {
	if len(r.remaining) < n {
		b := r.remaining
		r.remaining = nil
		return b, io.EOF
	}

	b := r.remaining[0:n]
	r.remaining = r.remaining[n:]
	return b, nil
}

// ReadString returns a string of size n from the buffer
func (r *ReadBuffer) ReadString(n int) (string, error) {
	b, err := r.ReadBytes(n)
	if err != nil {
		return "", err
	}

	// TODO(mmihic): This creates a copy, which sucks
	return string(b), nil
}

// ReadUint16 returns the next value in the buffer as a uint16
func (r *ReadBuffer) ReadUint16() (uint16, error) {
	b, err := r.ReadBytes(2)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint16(b), nil
}

// ReadUint32 returns the next value in the buffer as a uint32
func (r *ReadBuffer) ReadUint32() (uint32, error) {
	b, err := r.ReadBytes(4)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint32(b), nil
}

// ReadUint64 returns the next value in the buffer as a uint64
func (r *ReadBuffer) ReadUint64() (uint64, error) {
	b, err := r.ReadBytes(8)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint64(b), nil
}

// BytesRemaining returns the number of unconsumed bytes remaining in the buffer
func (r *ReadBuffer) BytesRemaining() int {
	return len(r.remaining)
}

// FillFrom fills the buffer from a reader
func (r *ReadBuffer) FillFrom(ior io.Reader, n int) (int, error) {
	if len(r.buffer) < n {
		return 0, ErrInsufficientBuffer
	}

	r.remaining = r.buffer[:n]
	return ior.Read(r.remaining)
}

// CurrentPos returns the current read position within the buffer
func (r *ReadBuffer) CurrentPos() int {
	return len(r.buffer) - len(r.remaining)
}

// Seek moves the current read position to the given offset in the buffer
func (r *ReadBuffer) Seek(offset int) error {
	if offset > len(r.buffer) {
		return ErrInsufficientBuffer
	}

	r.remaining = r.buffer[offset:]
	return nil
}

// Wrap initializes the buffer to read from the given byte slice
func (r *ReadBuffer) Wrap(b []byte) {
	r.buffer = b
	r.remaining = b
}

// A typed.WriteBuffer is a wrapper around an underlying []byte with methods to write to
// that buffer in big-endian format.  The buffer is of fixed size, and does not grow.
type WriteBuffer struct {
	buffer    []byte
	remaining []byte
}

// NewWriteBuffer creates a WriteBuffer wrapping the given slice
func NewWriteBuffer(buffer []byte) *WriteBuffer {
	return &WriteBuffer{buffer: buffer, remaining: buffer}
}

// NewWriteBufferWithSize create a new WriteBuffer using an internal buffer of the given size
func NewWriteBufferWithSize(size int) *WriteBuffer {
	return NewWriteBuffer(make([]byte, size))
}

// WriteByte writes a single byte to the buffer
func (w *WriteBuffer) WriteByte(n byte) error {
	if len(w.remaining) == 0 {
		return ErrBufferFull
	}

	w.remaining[0] = n
	w.remaining = w.remaining[1:]
	return nil
}

// WriteBytes writes a slice of bytes to the buffer
func (w *WriteBuffer) WriteBytes(b []byte) error {
	inbuf, err := w.reserve(len(b))
	if err != nil {
		return err
	}

	copy(inbuf, b)
	return nil
}

// WriteUint16 writes a big endian encoded uint16 value to the buffer
func (w *WriteBuffer) WriteUint16(n uint16) error {
	b, err := w.reserve(2)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint16(b, n)
	return nil
}

// WriteUint32 writes a big endian uint32 value to the buffer
func (w *WriteBuffer) WriteUint32(n uint32) error {
	b, err := w.reserve(4)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint32(b, n)
	return nil
}

// WriteUint64 writes a big endian uint64 to the buffer
func (w *WriteBuffer) WriteUint64(n uint64) error {
	b, err := w.reserve(8)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint64(b, n)
	return nil
}

// WriteString writes a string to the buffer
func (w *WriteBuffer) WriteString(s string) error {
	// NB(mmihic): Don't just call WriteBytes; that will make a double copy of the string due to the cast
	b, err := w.reserve(len(s))
	if err != nil {
		return err
	}

	copy(b, s)
	return nil
}

func (w *WriteBuffer) reserve(n int) ([]byte, error) {
	if len(w.remaining) < n {
		return nil, ErrBufferFull
	}

	b := w.remaining[0:n]
	w.remaining = w.remaining[n:]
	return b, nil
}

// BytesRemaining returns the number of available bytes remaining in the bufffer
func (w *WriteBuffer) BytesRemaining() int {
	return len(w.remaining)
}

// FlushTo flushes the written buffer to the given writer
func (w *WriteBuffer) FlushTo(iow io.Writer) (int, error) {
	dirty := w.buffer[0:w.BytesWritten()]
	return iow.Write(dirty)
}

// BytesWritten returns the number of bytes that have been written to the buffer
func (w *WriteBuffer) BytesWritten() int { return len(w.buffer) - len(w.remaining) }

// Reset resets the buffer to an empty state, ready for writing
func (w *WriteBuffer) Reset() { w.remaining = w.buffer }

// CurrentPos returns the current write position in the buffer
func (w *WriteBuffer) CurrentPos() int { return len(w.buffer) - len(w.remaining) }

// Seek moves the current write position to the given offset in the buffer
func (w *WriteBuffer) Seek(offset int) error {
	if offset > len(w.buffer) {
		return ErrInsufficientBuffer
	}

	w.remaining = w.buffer[offset:]
	return nil
}

// Wrap initializes the buffer to wrap the given byte slice
func (w *WriteBuffer) Wrap(b []byte) {
	w.buffer = b
	w.remaining = b
}
