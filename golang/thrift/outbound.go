package thrift

import "bytes"
import "errors"
import "github.com/apache/thrift/lib/go/thrift"
import tchannel "github.com/uber/tchannel/golang"
import "golang.org/x/net/context"
import "time"

// NewTChannelOutboundProtocol creates a TChannelOutboundProtocol
func NewTChannelOutboundProtocol(ctx context.Context, tchannel *tchannel.Channel,
	remoteHostPort, remoteServiceName, remoteProcessorName string,
	options OutboundOptions) (*TChannelOutboundProtocol, error) {

	return &TChannelOutboundProtocol{
		ctx:                 ctx,
		tchannel:            tchannel,
		remoteHostPort:      remoteHostPort,
		remoteServiceName:   remoteServiceName,
		remoteProcessorName: remoteProcessorName,
		options:             options,
	}, nil
}

type OutboundOptions struct {
	Timeout *time.Duration
}

//
// TChannelOutboundProtocol is a thrift.TProtocol implementation for
// outbound (i.e., client side) tchannel calls. It serves as the adaptor
// between the generated thrift client and tchannel (tchannel.OutboundCall).
//
// Incoming and outgoing data is buffered in memory buffers and the actual
// parsing of the data is delegated to thrift.TBinaryProtocol.
//
// Warning: A TChannelOutboundProtocol instance is not thread safe, i.e.,
// it must not be used concurrently from multiple goroutines.
//
type TChannelOutboundProtocol struct {
	// state across calls
	ctx                 context.Context
	tchannel            *tchannel.Channel
	remoteHostPort      string
	remoteServiceName   string
	remoteProcessorName string
	options             OutboundOptions

	// state per call
	remoteOperationName      string
	call                     *tchannel.OutboundCall
	DelegatingOutputProtocol // thrift writer
	writeBuffer              *MemoryBufferTransport
	DelegatingInputProtocol  // thrift reader
	readBuffer               *MemoryBufferTransport
}

func (p *TChannelOutboundProtocol) makeArg1() string {
	// see https://github.com/uber/tchannel/blob/master/docs/thrift.md#arg1
	return p.remoteProcessorName + "::" + p.remoteOperationName
}

// WriteMessageBegin creates the write buffer and the TBinaryProtocol writer,
// and delegates the actual write to the writer.
func (p *TChannelOutboundProtocol) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	p.remoteOperationName = name
	p.writeBuffer = NewMemoryBufferTransport()
	p.DelegatingOutputProtocol = DelegatingOutputProtocol{thrift.NewTBinaryProtocol(p.writeBuffer, false, false)}
	return p.DelegatingOutputProtocol.WriteMessageBegin("" /* name goes in arg1 */, typeId, seqId)
}

// Flush takes the written content from the write buffer and writes
// it as arg3 to the underlying tchannel.
func (p *TChannelOutboundProtocol) Flush() error {
	// flush to write buffer
	if err := p.DelegatingOutputProtocol.Flush(); err != nil {
		return err
	}
	payload := p.writeBuffer.Bytes()

	// begin the outbound call
	ctx := p.ctx
	if p.options.Timeout != nil {
		ctx, _ = context.WithTimeout(p.ctx, *p.options.Timeout)
	}
	call, err := p.tchannel.BeginCall(ctx, p.remoteHostPort, p.remoteServiceName, p.makeArg1())
	if err != nil {
		return err
	} else {
		p.call = call
	}

	// write empty arg2
	p.call.WriteArg2(tchannel.BytesOutput(make([]byte, 0)))

	// write thrift payload to arg3
	return p.call.WriteArg3(tchannel.BytesOutput(payload))
}

// ReadMessageBegin reads arg3 from the underlying tchannel into the
// read buffer which the TBinaryProtocol reader can start reading from.
func (p *TChannelOutboundProtocol) ReadMessageBegin() (name string, typeId thrift.TMessageType, seqId int32, err error) {
	// skip arg2
	var respArg2 tchannel.BytesInput
	if err = p.call.Response().ReadArg2(&respArg2); err != nil {
		return
	}

	// TODO
	// current tchannel implementation requires calling ReadArg2()
	// before calling ApplicationError()
	if p.call.Response().ApplicationError() {
		err = errors.New("Application error")
		return
	}

	// read arg3 into the read buffer
	var respArg3 tchannel.BytesInput
	if err = p.call.Response().ReadArg3(&respArg3); err != nil {
		return
	}

	buf := bytes.NewBuffer([]byte(respArg3))
	p.readBuffer = NewMemoryBufferTransport2(buf)
	p.DelegatingInputProtocol = DelegatingInputProtocol{thrift.NewTBinaryProtocol(p.readBuffer, false, false)}

	// read from the read buffer
	return p.DelegatingInputProtocol.ReadMessageBegin()
}
