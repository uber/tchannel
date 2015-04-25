package thrift

import "errors"
import "fmt"
import "io"
import "strings"
import "github.com/apache/thrift/lib/go/thrift"
import tchannel "github.com/uber/tchannel/golang"

// NewTChannelInboundProtocolStreamed creates a TChannelInboundProtocolStream
func NewTChannelInboundProtocolStreamed(call *tchannel.InboundCall) *TChannelInboundProtocolStreamed {
	return &TChannelInboundProtocolStreamed{
		call: call,
	}
}

//
// TChannelInboundProtocolStreamed is a thrift.TProtocol implementation for
// inbound (i.e., server side) tchannel calls. It serves as the adaptor
// between the generated thrift server side code (thrift.TProcessor)
// and tchannel (tchannel.InboundCall).
//
// Unlike TChannelInboundProtocol, incoming and outgoing data is NOT buffered
// in memory buffers but rather streamed to the underlying tchannel. Like
// TChannelInboundProtocol, the actual parsing of the data is delegated to
// thrift.TBinaryProtocol.
//
// Warning: A TChannelInboundProtocolStreamed instance is not thread safe, i.e.,
// it must not be used concurrently from multiple goroutines.
//
type TChannelInboundProtocolStreamed struct {
	call *tchannel.InboundCall

	DelegatingOutputProtocol // thrift writer
	DelegatingInputProtocol  // thrift reader

	pipe *io.PipeWriter // pipe between the thrift writer and the tchannel reader
}

func (p *TChannelInboundProtocolStreamed) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	// write empty arg2
	if err := p.call.Response().WriteArg2(tchannel.BytesOutput(make([]byte, 0))); err != nil {
		return err
	}

	// pipe thrift payload into arg3: thrift writes to the pipe and tchannel reads from the pipe
	r, w := io.Pipe()
	p.pipe = w
	p.DelegatingOutputProtocol = DelegatingOutputProtocol{thrift.NewTBinaryProtocol(thrift.NewStreamTransportW(w), false, false)}

	// must read from the pipe in a separate goroutine to avoid deadlock on the pipe!
	go func() {
		arg3 := tchannel.NewStreamingOutput(r)
		if err := p.call.Response().WriteArg3(arg3); err != nil {
			//TODO log
			return
		}
	}()

	return p.DelegatingOutputProtocol.WriteMessageBegin(name, typeId, seqId)
}

func (p *TChannelInboundProtocolStreamed) Flush() error {
	if err := p.DelegatingOutputProtocol.Flush(); err != nil {
		return err
	}
	if err := p.pipe.Close(); err != nil {
		return err
	}
	return nil
}

func (p *TChannelInboundProtocolStreamed) ReadMessageBegin() (name string, typeId thrift.TMessageType, seqId int32, err error) {
	// skip arg2
	var arg2 tchannel.BytesInput
	if err = p.call.ReadArg2(&arg2); err != nil {
		return
	}

	// tchannel writes to the pipe and thrift reads from the pipe
	r, w := io.Pipe()
	p.DelegatingInputProtocol = DelegatingInputProtocol{thrift.NewTBinaryProtocol(thrift.NewStreamTransportR(r), false, false)}

	// must write to the pipe in a separate goroutine in order to avoid deadlock on the pipe!
	go func() {
		arg3 := tchannel.NewStreamingInput(w)
		if err = p.call.ReadArg3(arg3); err != nil {
			// TODO log
			return
		}
	}()

	// parse the thrift method from arg1
	if arg1 := string(p.call.Operation()); strings.Index(arg1, "::") < 0 {
		err = errors.New(fmt.Sprintf("Malformed arg1: %s", arg1))
		return
	} else {
		name = strings.Split(arg1, "::")[1]
	}

	// read from the read buffer
	_, typeId, seqId, err = p.DelegatingInputProtocol.ReadMessageBegin()
	return
}
