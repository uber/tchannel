package thrift

// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

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
