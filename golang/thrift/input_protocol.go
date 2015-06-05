package thrift

import (
	"io"
	"strings"

	"github.com/apache/thrift/lib/go/thrift"
)
import tchannel "github.com/uber/tchannel/golang"

// NewTChannelInbound creates a NewTChannelInbound
func NewTChannelInbound(call *tchannel.InboundCall) thrift.TProtocol {
	return &inProtocol{
		protocol: newProtocol(),
		call:     call,
	}
}

type inProtocol struct {
	*protocol

	call       *tchannel.InboundCall
	arg3Writer io.WriteCloser
	arg3Reader io.ReadCloser
}

func (p *inProtocol) Method() string {
	op := string(p.call.Operation())
	sep := strings.Index(op, "::")
	return op[sep+2:]
}

func (p *inProtocol) ReadMessageBegin() (string, thrift.TMessageType, int32, error) {
	reader, err := p.call.Arg2Reader()
	if err != nil {
		return "", 0, 0, err
	}
	if err := reader.Close(); err != nil {
		return "", 0, 0, err
	}

	if p.arg3Reader, err = p.call.Arg3Reader(); err != nil {
		return "", 0, 0, err
	}

	p.transport.Reader = p.arg3Reader
	return p.Method(), thrift.CALL, 0, err
}

func (p *inProtocol) ReadMessageEnd() error {
	reader := p.arg3Reader
	p.arg3Reader = nil
	p.transport.Reader = nil
	return reader.Close()
}

func (p *inProtocol) WriteMessageBegin(name string, typeID thrift.TMessageType, seqID int32) error {
	resp := p.call.Response()

	if typeID == thrift.EXCEPTION {
		resp.SetApplicationError()
	}

	writer, err := resp.Arg2Writer()
	if err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	if p.arg3Writer, err = resp.Arg3Writer(); err != nil {
		return err
	}

	p.transport.Writer = p.arg3Writer
	return nil
}

// WriteMessageEnd is called after writing out the call response.
func (p *inProtocol) WriteMessageEnd() error {
	writer := p.arg3Writer
	p.call = nil
	p.arg3Writer = nil
	p.transport.Writer = nil
	return writer.Close()
}
