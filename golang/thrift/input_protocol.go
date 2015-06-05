package thrift

import (
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

	call *tchannel.InboundCall
}

func (p *inProtocol) Method() string {
	op := string(p.call.Operation())
	sep := strings.Index(op, "::")
	return op[sep+2:]
}

func (p *inProtocol) ReadMessageBegin() (string, thrift.TMessageType, int32, error) {
	if err := p.call.ReadArg2(nullArg{}); err != nil {
		return "", 0, 0, err
	}

	err := p.readArg3(p.call)
	return p.Method(), thrift.CALL, 0, err
}

func (p *inProtocol) ReadMessageEnd() error {
	close(p.errC)
	return nil
}

func (p *inProtocol) WriteMessageBegin(name string, typeID thrift.TMessageType, seqID int32) error {
	resp := p.call.Response()

	if typeID == thrift.EXCEPTION {
		resp.SetApplicationError()
	}

	if err := resp.WriteArg2(nullArg{}); err != nil {
		return err
	}

	return p.writeArg3(resp)
}

// WriteMessageEnd is called after writing out the call response.
func (p *inProtocol) WriteMessageEnd() error {
	close(p.errC)
	p.call = nil
	return nil
}
