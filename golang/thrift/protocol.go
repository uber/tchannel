package thrift

import (
	"github.com/apache/thrift/lib/go/thrift"
	"github.com/uber/tchannel/golang"
)

// protocol is the common functionality for inProtocol and outProtocol.
type protocol struct {
	thrift.TProtocol

	// transport is the underlying transport that the TProtocol will write to.
	// The actual readers/writers are set from the tchannel WriteTo/ReadFrom calls.
	transport *readerWriterTransport

	// errC is the channel that errors are reported to when dealing with arg3.
	errC chan<- error
}

func newProtocol() *protocol {
	transport := &readerWriterTransport{}
	return &protocol{
		TProtocol: thrift.NewTBinaryProtocolTransport(transport),
		transport: transport,
	}
}

// createArg sets up channels to coordinate argument read/write status.
func (p *protocol) createArg() (readerWriterArg, chan struct{}) {
	updated := make(chan struct{})
	errC := make(chan error)

	p.errC = errC
	return readerWriterArg{
		transport: p.transport,
		updated:   updated,
		err:       errC,
	}, updated
}

type argWriter interface {
	WriteArg3(arg tchannel.Output) error
}

func (p *protocol) writeArg3(argWriter argWriter) error {
	var err error

	arg3, updated := p.createArg()
	go func() {
		err = argWriter.WriteArg3(arg3)
		close(updated)
	}()

	<-updated
	return err
}

type argReader interface {
	ReadArg3(arg tchannel.Input) error
}

func (p *protocol) readArg3(argReader argReader) error {
	var err error

	arg3, updated := p.createArg()
	go func() {
		err = argReader.ReadArg3(arg3)
		close(updated)
	}()

	<-updated
	return err
}
