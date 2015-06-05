package thrift

import (
	"io"

	"github.com/apache/thrift/lib/go/thrift"
)

// readerWriterTransport is a transport that reads and writes from the underlying Reader/Writer.
type readerWriterTransport struct {
	io.Writer
	io.Reader
}

func (t *readerWriterTransport) Open() error {
	return nil
}

func (t *readerWriterTransport) Flush() error {
	return nil
}

func (t *readerWriterTransport) IsOpen() bool {
	return true
}

func (t *readerWriterTransport) Close() error {
	return nil
}

func (t *readerWriterTransport) Write(p []byte) (n int, err error) {
	return t.Writer.Write(p)
}

var _ thrift.TTransport = &readerWriterTransport{}
