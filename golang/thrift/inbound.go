package thrift

import "bytes"
import "errors"
import "fmt"
import "strings"
import "github.com/apache/thrift/lib/go/thrift"
import tchannel "github.com/uber/tchannel/golang"

// NewTChannelInboundProtocol creates a TChannelInboundProtocol
func NewTChannelInboundProtocol(call *tchannel.InboundCall) *TChannelInboundProtocol {
	return &TChannelInboundProtocol{
		call: call,
	}
}

//
// TChannelInboundProtocol is a thrift.TProtocol implementation for
// inbound (i.e., server side) tchannel calls. It serves as the adaptor
// between the generated thrift server side code (thrift.TProcessor)
// and tchannel (tchannel.InboundCall).
//
// Incoming and outgoing data is buffered in memory buffers and the
// actual parsing of the data is delegated to thrift.TBinaryProtocol.
//
// Warning: A TChannelInboundProtocol instance is not thread safe, i.e.,
// it must not be used concurrently from multiple goroutines.
//
type TChannelInboundProtocol struct {
	call *tchannel.InboundCall

	DelegatingOutputProtocol // thrift writer
	writeBuffer              *MemoryBufferTransport

	DelegatingInputProtocol // thrift reader
	readBuffer              *MemoryBufferTransport
}

// WriteMessageBegin creates the writer buffer and a TBinaryProtocol
// writer and delegates the write to the writer
func (p *TChannelInboundProtocol) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	p.writeBuffer = NewMemoryBufferTransport()
	p.DelegatingOutputProtocol = DelegatingOutputProtocol{thrift.NewTBinaryProtocol(p.writeBuffer, false, false)}
	return p.DelegatingOutputProtocol.WriteMessageBegin(name, typeId, seqId)
}

// Flush takes the written content from the write buffer and writes
// it as arg3 to the underlying tchannel.
func (p *TChannelInboundProtocol) Flush() error {
	// flush to memory buffer
	if err := p.DelegatingOutputProtocol.Flush(); err != nil {
		return err
	}
	payload := p.writeBuffer.Bytes()

	// write empty arg2
	p.call.Response().WriteArg2(tchannel.BytesOutput(make([]byte, 0)))

	// write payload to arg3
	p.call.Response().WriteArg3(tchannel.BytesOutput(payload))
	return nil
}

// ReadMessageBegin reads arg3 from the underlying tchannel into the
// read buffer which the TBinaryProtocol reader can start reading from.
func (p *TChannelInboundProtocol) ReadMessageBegin() (name string, typeId thrift.TMessageType, seqId int32, err error) {
	// skip arg2
	var arg2 tchannel.BytesInput
	if err = p.call.ReadArg2(&arg2); err != nil {
		return
	}

	// read arg3 into read buffer
	var arg3 tchannel.BytesInput
	if err = p.call.ReadArg3(&arg3); err != nil {
		return
	}

	buf := bytes.NewBuffer([]byte(arg3))
	p.readBuffer = NewMemoryBufferTransport2(buf)
	p.DelegatingInputProtocol = DelegatingInputProtocol{thrift.NewTBinaryProtocol(p.readBuffer, false, false)}

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
