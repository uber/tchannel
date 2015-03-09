package tchannel

import (
	"io"
	"io/ioutil"
)

// A InputArgument is able to read an argument from a call body
type InputArgument interface {
	// Reads the argument from the given io.Reader
	ReadFrom(r io.Reader) error
}

// A OutputArgument is able to write an argument to a call body
type OutputArgument interface {
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

// StreamingOutputArgument streams the contents of the given io.Reader
type StreamingOutputArgument struct {
	r io.Reader
}

func NewStreamingOutputArgument(r io.Reader) OutputArgument { return StreamingOutputArgument{r} }

func (arg StreamingOutputArgument) WriteTo(w io.Writer) error {
	if _, err := io.Copy(w, arg.r); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// StreamingInputArgument streams the contents of the argument to the given io.Writer
type StreamingInputArgument struct {
	w io.Writer
}

func NewStreamingInputArgument(w io.Writer) InputArgument { return StreamingInputArgument{w} }

func (arg StreamingInputArgument) ReadFrom(r io.Reader) error {
	if _, err := io.Copy(arg.w, r); err != nil && err != io.EOF {
		return err
	}
	return nil
}
