package tchannel

import (
	"io"
	"io/ioutil"
)

// A Input is able to read an argument from a call body
type Input interface {
	// Reads the argument from the given io.Reader
	ReadFrom(r io.Reader) error
}

// A Output is able to write an argument to a call body
type Output interface {
	// Writes the argument to the given io.Writer
	WriteTo(w io.Writer) error
}

// Outputs a set of bytes to a message
type BytesOutput []byte

func (p BytesOutput) WriteTo(w io.Writer) error {
	if _, err := w.Write(p); err != nil {
		return err
	}

	return nil
}

// Reads in an argument as a set of bytes
type BytesInput []byte

func (p *BytesInput) ReadFrom(r io.Reader) error {
	var err error
	if *p, err = ioutil.ReadAll(r); err != nil && err != io.EOF {
		return err
	}

	return nil
}

// StreamingOutput streams the contents of the given io.Reader
type StreamingOutput struct {
	r io.Reader
}

func NewStreamingOutput(r io.Reader) Output { return StreamingOutput{r} }

func (arg StreamingOutput) WriteTo(w io.Writer) error {
	if _, err := io.Copy(w, arg.r); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// StreamingInput streams the contents of the argument to the given io.Writer
type StreamingInput struct {
	w io.Writer
}

func NewStreamingInput(w io.Writer) Input { return StreamingInput{w} }

func (arg StreamingInput) ReadFrom(r io.Reader) error {
	if _, err := io.Copy(arg.w, r); err != nil && err != io.EOF {
		return err
	}
	return nil
}
