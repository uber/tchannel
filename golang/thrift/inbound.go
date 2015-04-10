package thrift

import "bytes"
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
type TChannelInboundProtocol struct {
	call *tchannel.InboundCall

	writer      *thrift.TBinaryProtocol
	writeBuffer *MemoryBufferTransport

	reader     *thrift.TBinaryProtocol
	readBuffer *MemoryBufferTransport
}

// WriteMessageBegin creates the writer buffer and a TBinaryProtocol
// writer and delegates the write to the writer
func (p *TChannelInboundProtocol) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	p.writeBuffer = NewMemoryBufferTransport()
	p.writer = thrift.NewTBinaryProtocol(p.writeBuffer, false, false)
	return p.writer.WriteMessageBegin(name, typeId, seqId)
}

// WriteMessageEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteMessageEnd() error {
	return p.writer.WriteMessageEnd()
}

// WriteStructBegin delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteStructBegin(name string) error {
	err := p.writer.WriteStructBegin(name)
	return err
}

// WriteStructEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteStructEnd() error {
	return p.writer.WriteStructEnd()
}

// WriteFieldBegin delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteFieldBegin(name string, typeId thrift.TType, id int16) error {
	return p.writer.WriteFieldBegin(name, typeId, id)
}

// WriteFieldEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteFieldEnd() error {
	return p.writer.WriteFieldEnd()
}

// WriteFieldStop delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteFieldStop() error {
	return p.writer.WriteFieldStop()
}

// WriteMapBegin delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteMapBegin(keyType thrift.TType, valueType thrift.TType, size int) error {
	return p.writer.WriteMapBegin(keyType, valueType, size)
}

// WriteMapEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteMapEnd() error {
	return p.writer.WriteMapEnd()
}

// WriteListBegin delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteListBegin(elemType thrift.TType, size int) error {
	return p.writer.WriteListBegin(elemType, size)
}

// WriteListEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteListEnd() error {
	return p.writer.WriteListEnd()
}

// WriteSetBegin delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteSetBegin(elemType thrift.TType, size int) error {
	return p.writer.WriteSetBegin(elemType, size)
}

// WriteSetEnd delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteSetEnd() error {
	return p.writer.WriteSetEnd()
}

// WriteBool delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteBool(value bool) error {
	return p.writer.WriteBool(value)
}

// WriteByte delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteByte(value byte) error {
	return p.writer.WriteByte(value)
}

// WriteI16 delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteI16(value int16) error {
	return p.writer.WriteI16(value)
}

// WriteI32 delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteI32(value int32) error {
	return p.writer.WriteI32(value)
}

// WriteI64 delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteI64(value int64) error {
	return p.writer.WriteI64(value)
}

// WriteDouble delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteDouble(value float64) error {
	return p.writer.WriteDouble(value)
}

// WriteString delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteString(value string) error {
	return p.writer.WriteString(value)
}

// WriteBinary delegates to the TBinaryProtocol writer
func (p *TChannelInboundProtocol) WriteBinary(value []byte) error {
	return p.writer.WriteBinary(value)
}

// Flush takes the written content from the write buffer and writes
// it as arg3 to the underlying tchannel.
func (p *TChannelInboundProtocol) Flush() error {
	// flush to memory buffer
	if err := p.writer.Flush(); err != nil {
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
	p.reader = thrift.NewTBinaryProtocol(p.readBuffer, false, false)

	// read from the read buffer
	return p.reader.ReadMessageBegin()
}

// ReadMessageEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadMessageEnd() error {
	return p.reader.ReadMessageEnd()
}

// ReadStructBegin delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadStructBegin() (name string, err error) {
	return p.reader.ReadStructBegin()
}

// ReadStructEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadStructEnd() error {
	return p.reader.ReadStructEnd()
}

// ReadFieldBegin delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadFieldBegin() (name string, typeId thrift.TType, id int16, err error) {
	return p.reader.ReadFieldBegin()
}

// ReadFieldEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadFieldEnd() error {
	return p.reader.ReadFieldEnd()
}

// ReadMapBegin delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadMapBegin() (keyType thrift.TType, valueType thrift.TType, size int, err error) {
	return p.reader.ReadMapBegin()
}

// ReadMapEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadMapEnd() error {
	return p.reader.ReadMapEnd()
}

// ReadListBegin delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadListBegin() (elemType thrift.TType, size int, err error) {
	return p.reader.ReadListBegin()
}

// ReadListEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadListEnd() error {
	return p.reader.ReadListEnd()
}

// ReadSetBegin delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadSetBegin() (elemType thrift.TType, size int, err error) {
	return p.reader.ReadSetBegin()
}

// ReadSetEnd delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadSetEnd() error {
	return p.reader.ReadSetEnd()
}

// ReadBool delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadBool() (value bool, err error) {
	return p.reader.ReadBool()
}

// ReadByte delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadByte() (value byte, err error) {
	return p.reader.ReadByte()
}

// ReadI16 delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadI16() (value int16, err error) {
	return p.reader.ReadI16()
}

// ReadI32 delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadI32() (value int32, err error) {
	return p.reader.ReadI32()
}

// ReadI64 delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadI64() (value int64, err error) {
	return p.reader.ReadI64()
}

// ReadDouble delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadDouble() (value float64, err error) {
	return p.reader.ReadDouble()
}

// ReadString delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadString() (value string, err error) {
	return p.reader.ReadString()
}

// ReadBinary delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) ReadBinary() (value []byte, err error) {
	return p.reader.ReadBinary()
}

// Skip delegates to the TBinaryProtocol reader
func (p *TChannelInboundProtocol) Skip(fieldType thrift.TType) (err error) {
	return p.reader.Skip(fieldType)
}

// Transport returns nil
func (p *TChannelInboundProtocol) Transport() thrift.TTransport {
	return nil
}
