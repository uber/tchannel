package tchannel

import (
	"io"
	"io/ioutil"
	"os"
)

// A InputArgument is able to read an argument from a call body
type InputArgument interface {
	ReadFrom(r io.Reader) error
}

// A OutputArgument is able to write an argument to a call body
type OutputArgument interface {
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

// FileArgument wraps an os.File and allows it to be used as an input or output argument
type FileArgument struct {
	f *os.File
}

func NewFileArgument(f *os.File) FileArgument {
	return FileArgument{f: f}
}

func (f FileArgument) WriteTo(w io.Writer) error {
	_, err := io.Copy(w, f.f)
	return err
}

func (f FileArgument) ReadFrom(r io.Reader) error {
	_, err := io.Copy(f.f, r)
	return err
}
