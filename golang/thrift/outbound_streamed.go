package thrift

import "errors"
import "github.com/apache/thrift/lib/go/thrift"
import tchannel "github.com/uber/tchannel/golang"
import "golang.org/x/net/context"
import "io"

// NewTChannelOutboundProtocolStreamed creates a TChannelOutboundProtocolStreamed
func NewTChannelOutboundProtocolStreamed(ctx context.Context, tchannel *tchannel.Channel,
	remoteHostPort, remoteServiceName, remoteProcessorName string,
	options OutboundOptions) (*TChannelOutboundProtocolStreamed, error) {

	return &TChannelOutboundProtocolStreamed{
		ctx:                 ctx,
		tchannel:            tchannel,
		remoteHostPort:      remoteHostPort,
		remoteServiceName:   remoteServiceName,
		remoteProcessorName: remoteProcessorName,
		options:             options,
	}, nil
}

//
// TChannelOutboundProtocolStreamed is a thrift.TProtocol implementation for
// outbound (i.e., client side) tchannel calls. It serves as the adaptor
// between the generated thrift client and tchannel (tchannel.OutboundCall).
//
// Unlike TChannelOutboundProtocol, incoming and outgoing data is NOT buffered
// in memory buffers but rather streamed to the underlying tchannel. Like
// TChannelOutboundProtocol, the actual parsing of the data is delegated to
// thrift.TBinaryProtocol.
//
// Warning: A TChannelOutboundProtocolStreamed instance is not thread safe, i.e.,
// it must not be used concurrently from multiple goroutines.
//
type TChannelOutboundProtocolStreamed struct {
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
	DelegatingOutputProtocol                // thrift writer
	DelegatingInputProtocol                 // thrift reader
	pipe                     *io.PipeWriter // pipe between the thrift writer and the tchannel reader
}

func (p *TChannelOutboundProtocolStreamed) makeArg1() string {
	// see https://github.com/uber/tchannel/blob/master/docs/thrift.md#arg1
	return p.remoteProcessorName + "::" + p.remoteOperationName
}

func (p *TChannelOutboundProtocolStreamed) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	// remember operation name for the duration of this call
	p.remoteOperationName = name

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
	if err := p.call.WriteArg2(tchannel.BytesOutput(make([]byte, 0))); err != nil {
		return err
	}

	// pipe thrift payload into arg3: thrift writes to the pipe and tchannel reads from the pipe
	r, w := io.Pipe()
	p.pipe = w
	p.DelegatingOutputProtocol = DelegatingOutputProtocol{thrift.NewTBinaryProtocol(thrift.NewStreamTransportW(w), false, false)}

	// must read from the pipe in a separate goroutine in order to avoid deadlock on the pipe!
	go func() {
		arg3 := tchannel.NewStreamingOutput(r)
		if err := p.call.WriteArg3(arg3); err != nil {
			// TODO log
			return
		}
	}()

	return p.DelegatingOutputProtocol.WriteMessageBegin("" /* name goes in arg1 */, typeId, seqId)
}

func (p *TChannelOutboundProtocolStreamed) Flush() error {
	// flush to write buffer
	if err := p.DelegatingOutputProtocol.Flush(); err != nil {
		return err
	}
	if err := p.pipe.Close(); err != nil {
		return err
	}
	return nil
}

func (p *TChannelOutboundProtocolStreamed) ReadMessageBegin() (name string, typeId thrift.TMessageType, seqId int32, err error) {
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

	// tchannel writes to the pipe and thrift reads from the pipe
	r, w := io.Pipe()
	transport := thrift.NewStreamTransportR(r)
	p.DelegatingInputProtocol = DelegatingInputProtocol{thrift.NewTBinaryProtocol(transport, false, false)}

	// must write to the pipe in a separate goroutine in order to avoid deadlock on the pipe!
	go func() {
		respArg3 := tchannel.NewStreamingInput(w)
		if err = p.call.Response().ReadArg3(respArg3); err != nil {
			// TODO log
			return
		}
	}()

	// read from the read buffer
	return p.DelegatingInputProtocol.ReadMessageBegin()
}
