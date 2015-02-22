package binio

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"io"
)

// Writer for binary content (in BigEndian format).  Buffers writes as needed
type Writer interface {
	Flush() error
	WriteByte(n byte) error
	WriteBytes(b []byte) error
	WriteUint16(n uint16) error
	WriteUint32(n uint32) error
	WriteUint64(n uint64) error
	WriteString(s string) error
}

func NewWriterSize(w io.Writer, size int) Writer {
	return &writer{w: bufio.NewWriterSize(w, size)}
}

func NewWriter(w io.Writer) Writer {
	return &writer{w: bufio.NewWriter(w)}
}

type writer struct {
	w *bufio.Writer
}

func (w *writer) Flush() error {
	return w.w.Flush()
}

func (w *writer) WriteByte(n byte) error {
	return w.w.WriteByte(n)
}

func (w *writer) WriteBytes(b []byte) error {
	var err error
	_, err = w.w.Write(b)
	return err
}

func (w *writer) WriteString(s string) error {
	var err error
	_, err = w.w.WriteString(s)
	return err
}

func (w *writer) WriteUint16(n uint16) error {
	return w.WriteBytes([]byte{byte(n >> 8), byte(n)})
}

func (w *writer) WriteUint32(n uint32) error {
	return w.WriteBytes([]byte{byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)})
}

func (w *writer) WriteUint64(n uint64) error {
	return w.WriteBytes([]byte{byte(n >> 56), byte(n >> 48), byte(n >> 40), byte(n >> 32),
		byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)})
}

// Writes binary content in BigEndian format
type Reader interface {
	ReadByte() (byte, error)
	ReadFull(b []byte) error
	ReadBytes(n int) ([]byte, error)
	ReadString(n int) (string, error)
	ReadUint16() (uint16, error)
	ReadUint32() (uint32, error)
	ReadUint64() (uint64, error)

	// Attempts to read n bytes from the underlying stream, avoiding a copy if possible (i.e. if the underlying
	// reader is already maintaining a full buffer and can just wrap a slice of that buffer in a Reader)
	ReadBytesNoCopy(n int) (io.Reader, error)
}

func NewReader(r io.Reader) Reader {
	return &reader{r: r}
}

// A generic Reader that can work with any underlying io.Reader.  We'll produce more optimized readers
// for the common scenario where the underlying reader is managing one or more fragmentation buffers,
// allowing us to avoid unnecessary copies.
type reader struct {
	r io.Reader
}

func (r *reader) ReadByte() (byte, error) {
	// This is the worst thing ever
	var b [1]byte
	if err := r.Read(b[:]); err != nil {
		return 0, err
	}

	return b[0], nil
}

func (r *reader) ReadBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(r.r, b); err != nil {
		return nil, err
	}

	return b, nil
}

// TODO(mmihic): Get rid of method below
func (r *reader) ReadFull(b []byte) error {
	return r.Read(b)
}

func (r *reader) Read(b []byte) error {
	if _, err := io.ReadFull(r.r, b); err != nil {
		return err
	}

	return nil
}

func (r *reader) ReadString(n int) (string, error) {
	b, err := r.ReadBytes(n)
	if err != nil {
		return "", err

	}

	// TODO(mmihic): Unfortunately this results in a copy.  Would be nice to have a way to tell
	// golang that the underlying byte array is immutable, and thus we shouldn't bother
	return string(b), nil
}

func (r *reader) ReadUint16() (uint16, error) {
	var b [2]byte
	if err := r.Read(b[:]); err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint16(b[:]), nil
}

func (r *reader) ReadUint32() (uint32, error) {
	var b [4]byte
	if err := r.Read(b[:]); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(b[:]), nil
}

func (r *reader) ReadUint64() (uint64, error) {
	var b [8]byte
	if err := r.Read(b[:]); err != nil {
		return 0, err
	}

	return binary.BigEndian.Uint64(b[:]), nil
}

func (r *reader) ReadBytesNoCopy(n int) (io.Reader, error) {
	// TODO(mmihic): Support an optimized BufferedReader interface that can be used to avoid copies
	// from the underlying buffer if needed
	b, err := r.ReadBytes(n)
	if err != nil {
		return nil, err
	}

	return bytes.NewReader(b), nil
}
