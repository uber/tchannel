package thrift

import "bytes"
import "errors"
import "github.com/apache/thrift/lib/go/thrift"
import tchannel "github.com/uber/tchannel/golang"
import "golang.org/x/net/context"
import "time"

// NewTChannelOutboundProtocol creates a TChannelOutboundProtocol
func NewTChannelOutboundProtocol(ctx context.Context,
	remoteHostPort, remoteServiceName, remoteProcessorName string,
	timeout time.Duration) (*TChannelOutboundProtocol, error) {

	tchannel, err := tchannel.NewChannel("0.0.0.0:0", nil)
	if err != nil {
		return nil, err
	}

	return NewTChannelOutboundProtocol2(ctx, tchannel,
		remoteHostPort, remoteServiceName, remoteProcessorName, timeout)
}

// NewTChannelOutboundProtocol2 creates a TChannelOutboundProtocol
func NewTChannelOutboundProtocol2(ctx context.Context, tchannel *tchannel.Channel,
	remoteHostPort, remoteServiceName, remoteProcessorName string,
	timeout time.Duration) (*TChannelOutboundProtocol, error) {

	return &TChannelOutboundProtocol{
		ctx:                 ctx,
		tchannel:            tchannel,
		remoteHostPort:      remoteHostPort,
		remoteServiceName:   remoteServiceName,
		remoteProcessorName: remoteProcessorName,
		timeout:             timeout,
	}, nil
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
	timeout             time.Duration

	// state per call
	remoteOperationName string
	call                *tchannel.OutboundCall
	writer              *thrift.TBinaryProtocol
	writeBuffer         *MemoryBufferTransport
	reader              *thrift.TBinaryProtocol
	readBuffer          *MemoryBufferTransport
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
	p.writer = thrift.NewTBinaryProtocol(p.writeBuffer, false, false)
	return p.writer.WriteMessageBegin("" /* name goes in arg1 */, typeId, seqId)
}

// WriteMessageEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteMessageEnd() error {
	return p.writer.WriteMessageEnd()
}

// WriteStructBegin delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteStructBegin(name string) error {
	return p.writer.WriteStructBegin(name)
}

// WriteStructEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteStructEnd() error {
	return p.writer.WriteStructEnd()
}

// WriteFieldBegin delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteFieldBegin(name string, typeId thrift.TType, id int16) error {
	return p.writer.WriteFieldBegin(name, typeId, id)
}

// WriteFieldEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteFieldEnd() error {
	return p.writer.WriteFieldEnd()
}

// WriteFieldStop delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteFieldStop() error {
	return p.writer.WriteFieldStop()
}

// WriteMapBegin delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteMapBegin(keyType thrift.TType, valueType thrift.TType, size int) error {
	return p.writer.WriteMapBegin(keyType, valueType, size)
}

// WriteMapEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteMapEnd() error {
	return p.writer.WriteMapEnd()
}

// WriteListBegin delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteListBegin(elemType thrift.TType, size int) error {
	return p.writer.WriteListBegin(elemType, size)
}

// WriteListEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteListEnd() error {
	return p.writer.WriteListEnd()
}

// WriteSetBegin delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteSetBegin(elemType thrift.TType, size int) error {
	return p.writer.WriteSetBegin(elemType, size)
}

// WriteSetEnd delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteSetEnd() error {
	return p.writer.WriteSetEnd()
}

// WriteBool delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteBool(value bool) error {
	return p.writer.WriteBool(value)
}

// WriteByte delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteByte(value byte) error {
	return p.writer.WriteByte(value)
}

// WriteI16 delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteI16(value int16) error {
	return p.writer.WriteI16(value)
}

// WriteI32 delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteI32(value int32) error {
	return p.writer.WriteI32(value)
}

// WriteI64 delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteI64(value int64) error {
	return p.writer.WriteI64(value)
}

// WriteDouble delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteDouble(value float64) error {
	return p.writer.WriteDouble(value)
}

// WriteString delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteString(value string) error {
	return p.writer.WriteString(value)
}

// WriteBinary delegates to the TBinaryProtocol writer
func (p *TChannelOutboundProtocol) WriteBinary(value []byte) error {
	return p.writer.WriteBinary(value)
}

// Flush takes the written content from the write buffer and writes
// it as arg3 to the underlying tchannel.
func (p *TChannelOutboundProtocol) Flush() error {
	// flush to write buffer
	if err := p.writer.Flush(); err != nil {
		return err
	}
	payload := p.writeBuffer.Bytes()

	// begin the outbound call
	ctx, _ := context.WithTimeout(p.ctx, p.timeout)
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
	p.reader = thrift.NewTBinaryProtocol(p.readBuffer, false, false)

	// read from the read buffer
	return p.reader.ReadMessageBegin()
}

// ReadMessageEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadMessageEnd() error {
	return p.reader.ReadMessageEnd()
}

// ReadStructBegin delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadStructBegin() (name string, err error) {
	return p.reader.ReadStructBegin()
}

// ReadStructEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadStructEnd() error {
	return p.reader.ReadStructEnd()
}

// ReadFieldBegin delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadFieldBegin() (name string, typeId thrift.TType, id int16, err error) {
	return p.reader.ReadFieldBegin()
}

// ReadFieldEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadFieldEnd() error {
	return p.reader.ReadFieldEnd()
}

// ReadMapBegin delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadMapBegin() (keyType thrift.TType, valueType thrift.TType, size int, err error) {
	return p.reader.ReadMapBegin()
}

// ReadMapEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadMapEnd() error {
	return p.reader.ReadMapEnd()
}

// ReadListBegin delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadListBegin() (elemType thrift.TType, size int, err error) {
	return p.reader.ReadListBegin()
}

// ReadListEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadListEnd() error {
	return p.reader.ReadListEnd()
}

// ReadSetBegin delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadSetBegin() (elemType thrift.TType, size int, err error) {
	return p.reader.ReadSetBegin()
}

// ReadSetEnd delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadSetEnd() error {
	return p.reader.ReadSetEnd()
}

// ReadBool delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadBool() (value bool, err error) {
	return p.reader.ReadBool()
}

// ReadByte delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadByte() (value byte, err error) {
	return p.reader.ReadByte()
}

// ReadI16 delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadI16() (value int16, err error) {
	return p.reader.ReadI16()
}

// ReadI32 delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadI32() (value int32, err error) {
	return p.reader.ReadI32()
}

// ReadI64 delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadI64() (value int64, err error) {
	return p.reader.ReadI64()
}

// ReadDouble delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadDouble() (value float64, err error) {
	return p.reader.ReadDouble()
}

// ReadString delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadString() (value string, err error) {
	return p.reader.ReadString()
}

// ReadBinary delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) ReadBinary() (value []byte, err error) {
	return p.reader.ReadBinary()
}

// Skip delegates to the TBinaryProtocol reader
func (p *TChannelOutboundProtocol) Skip(fieldType thrift.TType) (err error) {
	return p.reader.Skip(fieldType)
}

// Transport returns nil
func (p *TChannelOutboundProtocol) Transport() thrift.TTransport {
	return nil
}
