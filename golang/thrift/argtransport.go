package thrift

import (
	"io"
	"io/ioutil"
	"math/rand"

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
	if rand.Intn(3) == 0 {
		// TODO: deal with random failures
		//fmt.Println("Fail randomly")
		//return 0, errors.New("random fail!")
	}
	return t.Writer.Write(p)
}

var _ thrift.TTransport = &readerWriterTransport{}

// readerWriterArg is a tchannel argument that can be used with readerWriterTransport
// to directly read/write thrift encoded values.
type readerWriterArg struct {
	transport *readerWriterTransport
	updated   chan<- struct{}
	err       <-chan error
}

// WriteTo updates the transport's Writer and notifies t.updated that the transport
// has been updated. It returns an error value from t.err.
func (t readerWriterArg) WriteTo(w io.Writer) error {
	t.transport.Writer = w
	t.updated <- struct{}{}
	/*
	  fmt.Println("WriteTo started")
	 	defer func() {
	 		fmt.Println("WriteTo ended")
	 	}()
	*/
	return <-t.err
}

// ReadFrom updates the transport's Reader and notifies t.updated that the transport
// has been updated. It returns an error value from t.err.
func (t readerWriterArg) ReadFrom(r io.Reader) error {
	t.transport.Reader = r
	t.updated <- struct{}{}
	/*
		fmt.Println("ReadFrom started")
		defer func() {
			fmt.Println("ReadFrom ended")
		}()
	*/
	return <-t.err
}

// nullArg is a dummy argument that can be used to write nothing and read nothing.
type nullArg struct{}

// WriteTo will not write anything to the given writer.
func (nullArg) WriteTo(w io.Writer) error {
	return nil
}

// ReadFrom will read r till EOF and discard all read data.
func (nullArg) ReadFrom(r io.Reader) error {
	_, err := io.Copy(ioutil.Discard, r)
	return err
}
