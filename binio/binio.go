package binio

import (
	"bufio"
	"encoding/binary"
	"io"
)

// Writer for binary content (in BigEndian format).  Buffers writes as needed
type Writer interface {
	Flush() error
	WriteError() error

	WriteByte(n byte)
	WriteBytes(b []byte)
	WriteUint16(n uint16)
	WriteUint32(n uint32)
	WriteUint64(n uint64)
	WriteString(s string)
}

func NewWriter(w io.Writer) Writer {
	return &writer{w: bufio.NewWriter(w)}
}

type writer struct {
	w   *bufio.Writer
	err error
}

func (w *writer) WriteError() error {
	return w.err
}

func (w *writer) Flush() error {
	if w.err != nil {
		return w.err
	}

	return w.w.Flush()
}

func (w *writer) WriteByte(n byte) {
	if w.err != nil {
		return
	}

	w.err = w.w.WriteByte(n)
}

func (w *writer) WriteBytes(b []byte) {
	if w.err != nil {
		return
	}

	_, w.err = w.w.Write(b)
}

func (w *writer) WriteString(s string) {
	if w.err != nil {
		return
	}

	_, w.err = w.w.WriteString(s)
}

func (w *writer) WriteUint16(n uint16) {
	w.WriteBytes([]byte{byte(n >> 8), byte(n)})
}

func (w *writer) WriteUint32(n uint32) {
	w.WriteBytes([]byte{byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)})
}

func (w *writer) WriteUint64(n uint64) {
	w.WriteBytes([]byte{byte(n >> 56), byte(n >> 48), byte(n >> 40), byte(n >> 32),
		byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)})
}

// Reader for binary content (in BigEndian format).  Tracks any read errors that occur; each of the
// ReadXXX methods return a zero-value on error, with ReadError() returning the last read error.
type Reader interface {
	// return true if the reader has reached the end of the stream
	EOF() bool

	// return the last read error
	ReadError() error

	ReadByte() byte
	ReadBytes(n int) []byte
	ReadString(n int) string
	ReadUint16() uint16
	ReadUint32() uint32
	ReadUint64() uint64
}

func NewReader(r io.Reader) Reader {
	return &reader{r: r}
}

// A generic Reader that can work with any underlying io.Reader.  We'll produce more optimized readers
// for the common scenario where the underlying reader is managing one or more fragmentation buffers,
// allowing us to avoid unnecessary copies.
type reader struct {
	r   io.Reader
	err error
}

func (r *reader) EOF() bool {
	return r.err == io.EOF
}

func (r *reader) ReadError() error {
	return r.err
}

func (r *reader) ReadByte() byte {
	// This is the worst thing ever
	var b [1]byte
	if !r.Read(b[:]) {
		return 0
	}

	return b[0]
}

func (r *reader) ReadBytes(n int) []byte {
	if r.err != nil {
		return nil
	}

	b := make([]byte, n)
	_, r.err = r.r.Read(b)
	if r.err != nil {
		return nil
	}

	return b
}

func (r *reader) Read(b []byte) bool {
	if r.err != nil {
		return false
	}

	_, r.err = r.r.Read(b)
	return r.err == nil
}

func (r *reader) ReadString(n int) string {
	// TODO(mmihic): Unfortunately this results in a copy.  Would be nice to have a way to tell
	// golang that the underlying byte array is immutable, and thus we shouldn't bother
	if b := r.ReadBytes(n); b != nil {
		return string(b)
	}

	return ""
}

func (r *reader) ReadUint16() uint16 {
	var b [2]byte
	if r.Read(b[:]) {
		return binary.BigEndian.Uint16(b[:])
	}

	return 0
}

func (r *reader) ReadUint32() uint32 {
	var b [4]byte
	if r.Read(b[:]) {
		return binary.BigEndian.Uint32(b[:])
	}

	return 0
}

func (r *reader) ReadUint64() uint64 {
	var b [8]byte
	if r.Read(b[:]) {
		return binary.BigEndian.Uint64(b[:])
	}

	return 0
}
