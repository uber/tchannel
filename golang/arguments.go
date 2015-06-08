package tchannel

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
	"encoding/json"
	"io"
	"io/ioutil"
)

// ArgReader providers a simpler interface to reading arguments.
type ArgReader struct {
	reader io.ReadCloser
	err    error
}

// NewArgReader wraps the result of calling ArgXReader to provide a simpler
// interface for reading arguments.
func NewArgReader(reader io.ReadCloser, err error) *ArgReader {
	return &ArgReader{reader, err}
}

func (r *ArgReader) read(f func() error) error {
	if r.err != nil {
		return r.err
	}
	if err := f(); err != nil {
		return err
	}
	return r.reader.Close()
}

// ReadBytes reads from the reader into the byte slice.
func (r *ArgReader) ReadBytes(bs *[]byte) error {
	return r.read(func() error {
		var err error
		*bs, err = ioutil.ReadAll(r.reader)
		return err
	})
}

// ReadJSON deserializes JSON from the underlying reader into data.
func (r *ArgReader) ReadJSON(data interface{}) error {
	return r.read(func() error {
		d := json.NewDecoder(r.reader)
		return d.Decode(data)
	})
}

// ArgWriter providers a simpler interface to writing arguments.
type ArgWriter struct {
	writer io.WriteCloser
	err    error
}

// NewArgWriter wraps the result of calling ArgXWriter to provider a simpler
// interface for writing arguments.
func NewArgWriter(writer io.WriteCloser, err error) *ArgWriter {
	return &ArgWriter{writer, err}
}

func (w *ArgWriter) write(f func() error) error {
	if w.err != nil {
		return w.err
	}

	if err := f(); err != nil {
		return err
	}

	return w.writer.Close()
}

// Write writes the given bytes to the underlying writer.
func (w *ArgWriter) Write(bs []byte) error {
	return w.write(func() error {
		_, err := w.writer.Write(bs)
		return err
	})
}

// WriteJSON writes the given object as JSON.
func (w *ArgWriter) WriteJSON(data interface{}) error {
	return w.write(func() error {
		e := json.NewEncoder(w.writer)
		return e.Encode(data)
	})
}
