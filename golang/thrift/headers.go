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

package thrift

import (
	"fmt"
	"io"
	"io/ioutil"

	"github.com/uber/tchannel/golang/typed"
)

// TODO(prashant): Use a small buffer and then flush it when it's full.
func writeHeaders(w io.Writer, headers map[string]string) error {
	// Calculate the size of the buffer that we need.
	size := 2
	for k, v := range headers {
		size += 4 /* size of key/value lengths */
		size += len(k) + len(v)
	}

	buf := make([]byte, size)
	writeBuffer := typed.NewWriteBuffer(buf)
	writeBuffer.WriteUint16(uint16(len(headers)))
	for k, v := range headers {
		writeBuffer.WriteLen16String(k)
		writeBuffer.WriteLen16String(v)
	}

	if err := writeBuffer.Err(); err != nil {
		return err
	}

	// Safety check to ensure the bytes written calculation is correct.
	if writeBuffer.BytesWritten() != size {
		return fmt.Errorf("writeHeaders size calculation wrong, expected to write %v bytes, only wrote %v bytes",
			size, writeBuffer.BytesWritten())
	}

	_, err := writeBuffer.FlushTo(w)
	return err
}

// TODO(prashant): Allow typed.ReadBuffer to read directly from the reader.
func readHeaders(r io.Reader) (map[string]string, error) {
	bs, err := ioutil.ReadAll(r)
	if err != nil {
		return nil, err
	}

	buffer := typed.NewReadBuffer(bs)
	numHeaders := buffer.ReadUint16()
	if numHeaders == 0 {
		return nil, buffer.Err()
	}

	headers := make(map[string]string)
	for i := 0; i < int(numHeaders) && buffer.Err() == nil; i++ {
		k := buffer.ReadLen16String()
		v := buffer.ReadLen16String()
		headers[k] = v
	}
	return headers, buffer.Err()
}
