package thrift

import "github.com/apache/thrift/lib/go/thrift"

// protocol is the common functionality for inProtocol and outProtocol.
type protocol struct {
	thrift.TProtocol

	// transport is the underlying transport that the TProtocol will write to.
	// The actual readers/writers are set from the tchannel WriteTo/ReadFrom calls.
	transport *readerWriterTransport
}

func newProtocol() *protocol {
	transport := &readerWriterTransport{}
	return &protocol{
		TProtocol: thrift.NewTBinaryProtocolTransport(transport),
		transport: transport,
	}
}
