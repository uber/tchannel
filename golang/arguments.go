package tchannel

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

// Outputs a set of bytes to a message
type BytesOutput []byte

func (out BytesOutput) WriteTo(w io.Writer) error {
	if _, err := w.Write(out); err != nil {
		return err
	}

	return nil
}

// Reads in an argument as a set of bytes
type BytesInput []byte

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

func NewStreamingOutput(r io.Reader) Output { return StreamingOutput{r} }

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

func NewStreamingInput(w io.Writer) Input { return StreamingInput{w} }

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

func NewJSONInput(data interface{}) Input { return JSONInput{data} }

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

func NewJSONOutput(data interface{}) Output { return JSONOutput{data} }

func (out JSONOutput) WriteTo(w io.Writer) error {
	bytes, err := json.Marshal(out.data)
	if err != nil {
		return err
	}

	return BytesOutput(bytes).WriteTo(w)
}
