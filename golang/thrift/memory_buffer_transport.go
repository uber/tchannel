package thrift

import (
	"bytes"
)

// MemoryBufferTransport is a memory buffer-based implementation of the
// thrift.TTransport interface. It's similar to thrift.TMemoryBuffer but
// this implementation can be initialized with a given byte buffer.
type MemoryBufferTransport struct {
	*bytes.Buffer
}

// NewMemoryBufferTransport creates a MemoryBufferTransport from a newly
// allocated byte buffer.
func NewMemoryBufferTransport() *MemoryBufferTransport {
	return &MemoryBufferTransport{Buffer: &bytes.Buffer{}}
}

// NewMemoryBufferTransport2 creates a MemoryBufferTransport from the
// given byte buffer.
func NewMemoryBufferTransport2(buf *bytes.Buffer) *MemoryBufferTransport {
	return &MemoryBufferTransport{Buffer: buf}
}

func (p *MemoryBufferTransport) IsOpen() bool {
	return true
}

func (p *MemoryBufferTransport) Open() error {
	return nil
}

func (p *MemoryBufferTransport) Close() error {
	p.Buffer.Reset()
	return nil
}

// Flushing a memory buffer is a no-op
func (p *MemoryBufferTransport) Flush() error {
	return nil
}
