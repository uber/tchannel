package typed

import (
	"encoding/binary"
	"errors"
	"io"
)

var (
	ErrBufferFull = errors.New("no more room in buffer")
)

// A typed.Reader is a wrapper around an underlying []byte with methods to read from
// that buffer in big-endian format.
type Reader interface {
	ReadByte() (byte, error)
	ReadBytes(n int) ([]byte, error)
	ReadString(n int) (string, error)
	ReadUint16() (uint16, error)
	ReadUint32() (uint32, error)
	ReadUint64() (uint64, error)
	BytesRemaining() int
}

// A typed.Writer is a wrapper around an underlying []byte with methods to write to
// that buffer in big-endian format.  The buffer is of fixed size, and does not grow.
type Writer interface {
	WriteByte(n byte) error
	WriteBytes(b []byte) error
	WriteUint16(n uint16) error
	WriteUint32(n uint32) error
	WriteUint64(n uint64) error
	WriteString(s string) error
	BytesRemaining() int
	BytesWritten() int
}

func NewReader(buffer []byte) Reader {
	return &reader{buffer}
}

type reader struct {
	buffer []byte
}

func (r *reader) ReadByte() (byte, error) {
	if len(r.buffer) == 0 {
		return 0, io.EOF
	}

	b := r.buffer[0]
	r.buffer = r.buffer[1:]
	return b, nil
}

func (r *reader) ReadBytes(n int) ([]byte, error) {
	if len(r.buffer) < n {
		b := r.buffer
		r.buffer = nil
		return b, io.EOF
	}

	b := r.buffer[0:n]
	r.buffer = r.buffer[n:]
	return b, nil
}

func (r *reader) ReadString(n int) (string, error) {
	b, err := r.ReadBytes(n)
	if err != nil {
		return "", err
	}

	// TODO(mmihic): This creates a copy, which sucks
	return string(b), nil
}

func (r *reader) ReadUint16() (uint16, error) {
	b, err := r.ReadBytes(2)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint16(b), nil
}

func (r *reader) ReadUint32() (uint32, error) {
	b, err := r.ReadBytes(4)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint32(b), nil
}

func (r *reader) ReadUint64() (uint64, error) {
	b, err := r.ReadBytes(8)
	if err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint64(b), nil
}

func (r *reader) BytesRemaining() int {
	return len(r.buffer)
}

func NewWriter(buffer []byte) Writer {
	return &writer{buffer: buffer, remaining: buffer}
}

type writer struct {
	buffer    []byte
	remaining []byte
}

func (w *writer) WriteByte(n byte) error {
	if len(w.remaining) == 0 {
		return ErrBufferFull
	}

	w.remaining[0] = n
	w.remaining = w.remaining[1:]
	return nil
}

func (w *writer) WriteBytes(b []byte) error {
	inbuf, err := w.reserve(len(b))
	if err != nil {
		return err
	}

	copy(inbuf, b)
	return nil
}

func (w *writer) WriteUint16(n uint16) error {
	b, err := w.reserve(2)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint16(b, n)
	return nil
}

func (w *writer) WriteUint32(n uint32) error {
	b, err := w.reserve(4)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint32(b, n)
	return nil
}

func (w *writer) WriteUint64(n uint64) error {
	b, err := w.reserve(8)
	if err != nil {
		return err
	}

	binary.BigEndian.PutUint64(b, n)
	return nil
}

func (w *writer) WriteString(s string) error {
	// NB(mmihic): Don't just call WriteBytes; that will make a double copy of the string due to the cast
	b, err := w.reserve(len(s))
	if err != nil {
		return err
	}

	copy(b, s)
	return nil
}

func (w *writer) reserve(n int) ([]byte, error) {
	if len(w.remaining) < n {
		return nil, ErrBufferFull
	}

	b := w.remaining[0:n]
	w.remaining = w.remaining[n:]
	return b, nil
}

func (w *writer) BytesRemaining() int {
	return len(w.remaining)
}

func (w *writer) BytesWritten() int {
	return len(w.buffer) - len(w.remaining)
}
