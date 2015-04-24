package thrift

import "github.com/apache/thrift/lib/go/thrift"

type DelegatingOutputProtocol struct {
	Delegate thrift.TProtocol
}

type DelegatingInputProtocol struct {
	Delegate thrift.TProtocol
}

func (p *DelegatingOutputProtocol) WriteMessageBegin(name string, typeId thrift.TMessageType, seqId int32) error {
	return p.Delegate.WriteMessageBegin(name, typeId, seqId)
}

func (p *DelegatingOutputProtocol) WriteMessageEnd() error {
	return p.Delegate.WriteMessageEnd()
}

func (p *DelegatingOutputProtocol) WriteStructBegin(name string) error {
	return p.Delegate.WriteStructBegin(name)
}

func (p *DelegatingOutputProtocol) WriteStructEnd() error {
	return p.Delegate.WriteStructEnd()
}

func (p *DelegatingOutputProtocol) WriteFieldBegin(name string, typeId thrift.TType, id int16) error {
	return p.Delegate.WriteFieldBegin(name, typeId, id)
}

func (p *DelegatingOutputProtocol) WriteFieldEnd() error {
	return p.Delegate.WriteFieldEnd()
}

func (p *DelegatingOutputProtocol) WriteFieldStop() error {
	return p.Delegate.WriteFieldStop()
}

func (p *DelegatingOutputProtocol) WriteMapBegin(keyType thrift.TType, valueType thrift.TType, size int) error {
	return p.Delegate.WriteMapBegin(keyType, valueType, size)
}

func (p *DelegatingOutputProtocol) WriteMapEnd() error {
	return p.Delegate.WriteMapEnd()
}

func (p *DelegatingOutputProtocol) WriteListBegin(elemType thrift.TType, size int) error {
	return p.Delegate.WriteListBegin(elemType, size)
}

func (p *DelegatingOutputProtocol) WriteListEnd() error {
	return p.Delegate.WriteListEnd()
}

func (p *DelegatingOutputProtocol) WriteSetBegin(elemType thrift.TType, size int) error {
	return p.Delegate.WriteSetBegin(elemType, size)
}

func (p *DelegatingOutputProtocol) WriteSetEnd() error {
	return p.Delegate.WriteSetEnd()
}

func (p *DelegatingOutputProtocol) WriteBool(value bool) error {
	return p.Delegate.WriteBool(value)
}

func (p *DelegatingOutputProtocol) WriteByte(value byte) error {
	return p.Delegate.WriteByte(value)
}

func (p *DelegatingOutputProtocol) WriteI16(value int16) error {
	return p.Delegate.WriteI16(value)
}

func (p *DelegatingOutputProtocol) WriteI32(value int32) error {
	return p.Delegate.WriteI32(value)
}

func (p *DelegatingOutputProtocol) WriteI64(value int64) error {
	return p.Delegate.WriteI64(value)
}

func (p *DelegatingOutputProtocol) WriteDouble(value float64) error {
	return p.Delegate.WriteDouble(value)
}

func (p *DelegatingOutputProtocol) WriteString(value string) error {
	return p.Delegate.WriteString(value)
}

func (p *DelegatingOutputProtocol) WriteBinary(value []byte) error {
	return p.Delegate.WriteBinary(value)
}

func (p *DelegatingOutputProtocol) Flush() error {
	return p.Delegate.Flush()
}

func (p *DelegatingInputProtocol) ReadMessageBegin() (name string, typeId thrift.TMessageType, seqId int32, err error) {
	return p.Delegate.ReadMessageBegin()
}

func (p *DelegatingInputProtocol) ReadMessageEnd() error {
	return p.Delegate.ReadMessageEnd()
}

func (p *DelegatingInputProtocol) ReadStructBegin() (name string, err error) {
	return p.Delegate.ReadStructBegin()
}

func (p *DelegatingInputProtocol) ReadStructEnd() error {
	return p.Delegate.ReadStructEnd()
}

func (p *DelegatingInputProtocol) ReadFieldBegin() (name string, typeId thrift.TType, id int16, err error) {
	return p.Delegate.ReadFieldBegin()
}

func (p *DelegatingInputProtocol) ReadFieldEnd() error {
	return p.Delegate.ReadFieldEnd()
}

func (p *DelegatingInputProtocol) ReadMapBegin() (keyType thrift.TType, valueType thrift.TType, size int, err error) {
	return p.Delegate.ReadMapBegin()
}

func (p *DelegatingInputProtocol) ReadMapEnd() error {
	return p.Delegate.ReadMapEnd()
}

func (p *DelegatingInputProtocol) ReadListBegin() (elemType thrift.TType, size int, err error) {
	return p.Delegate.ReadListBegin()
}

func (p *DelegatingInputProtocol) ReadListEnd() error {
	return p.Delegate.ReadListEnd()
}

func (p *DelegatingInputProtocol) ReadSetBegin() (elemType thrift.TType, size int, err error) {
	return p.Delegate.ReadSetBegin()
}

func (p *DelegatingInputProtocol) ReadSetEnd() error {
	return p.Delegate.ReadSetEnd()
}

func (p *DelegatingInputProtocol) ReadBool() (value bool, err error) {
	return p.Delegate.ReadBool()
}

func (p *DelegatingInputProtocol) ReadByte() (value byte, err error) {
	return p.Delegate.ReadByte()
}

func (p *DelegatingInputProtocol) ReadI16() (value int16, err error) {
	return p.Delegate.ReadI16()
}

func (p *DelegatingInputProtocol) ReadI32() (value int32, err error) {
	return p.Delegate.ReadI32()
}

func (p *DelegatingInputProtocol) ReadI64() (value int64, err error) {
	return p.Delegate.ReadI64()
}

func (p *DelegatingInputProtocol) ReadDouble() (value float64, err error) {
	return p.Delegate.ReadDouble()
}

func (p *DelegatingInputProtocol) ReadString() (value string, err error) {
	return p.Delegate.ReadString()
}

func (p *DelegatingInputProtocol) ReadBinary() (value []byte, err error) {
	return p.Delegate.ReadBinary()
}

func (p *DelegatingInputProtocol) Skip(fieldType thrift.TType) (err error) {
	return p.Delegate.Skip(fieldType)
}

func (p *DelegatingInputProtocol) Transport() thrift.TTransport {
	return p.Delegate.Transport()
}
