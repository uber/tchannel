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

// An Input is able to read an argument from a call body
type Input interface {
	// Reads the argument from the given io.Reader
	ReadFrom(r io.Reader) error
}

// An Output is able to write an argument to a call body
type Output interface {
	// Writes the argument to the given io.Writer
	WriteTo(w io.Writer) error
}

// A BytesOutput writes a byte slice as a call argument
type BytesOutput []byte

// WriteTo writes out the byte stream
func (out BytesOutput) WriteTo(w io.Writer) error {
	if _, err := w.Write(out); err != nil {
		return err
	}

	return nil
}

// A BytesInput reads an entire call argument into a byte slice
type BytesInput []byte

// ReadFrom fills in the byte slice from the input stream
func (in *BytesInput) ReadFrom(r io.Reader) error {
	var err error
	if *in, err = ioutil.ReadAll(r); err != nil && err != io.EOF {
		return err
	}

	return nil
}

// StreamingOutput streams the contents of the given io.Reader
type StreamingOutput struct {
	r io.Reader
}

// NewStreamingOutput creates a new StreamingOutput around an io.Reader
func NewStreamingOutput(r io.Reader) Output { return StreamingOutput{r} }

// WriteTo streams the contents of the io.Reader to the output
func (out StreamingOutput) WriteTo(w io.Writer) error {
	if _, err := io.Copy(w, out.r); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// StreamingInput streams the contents of the argument to the given io.Writer
type StreamingInput struct {
	w io.Writer
}

// NewStreamingInput creates a new StreamingInput around an io.Writer
func NewStreamingInput(w io.Writer) Input { return StreamingInput{w} }

// ReadFrom streams the contents of an argument to the output io.Writer
func (in StreamingInput) ReadFrom(r io.Reader) error {
	if _, err := io.Copy(in.w, r); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// JSONInput reads an interface encoded as a JSON object
type JSONInput struct {
	data interface{}
}

// NewJSONInput reates a new JSONInput around an arbitrary data interface
func NewJSONInput(data interface{}) Input { return JSONInput{data} }

// ReadFrom unmarshals the json data into the desired interface
func (in JSONInput) ReadFrom(r io.Reader) error {
	var bytes BytesInput

	if err := bytes.ReadFrom(r); err != nil {
		return err
	}

	return json.Unmarshal([]byte(bytes), in.data)
}

// JSONOutput writes an interface as an encoded JSON object
type JSONOutput struct {
	data interface{}
}

// NewJSONOutput creates a new JSONOutput around an arbitrary data interface
func NewJSONOutput(data interface{}) Output { return JSONOutput{data} }

// WriteTo marshals the data to the output stream in json format
func (out JSONOutput) WriteTo(w io.Writer) error {
	bytes, err := json.Marshal(out.data)
	if err != nil {
		return err
	}

	return BytesOutput(bytes).WriteTo(w)
}
