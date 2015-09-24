// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

package thrift

import (
	"io"

	"github.com/apache/thrift/lib/go/thrift"
	"github.com/uber/tchannel/golang"
)

// This file defines interfaces that are used or exposed by thrift-gen generated code.
// TChanClient is used by the generated code to make outgoing requests.
// TChanServer is exposed by the generated code, and is called on incoming requests.

// TChanClient abstracts calling a Thrift endpoint, and is used by the generated client code.
type TChanClient interface {
	// Call should be passed the method to call and the request/response Thrift structs.
	Call(ctx Context, serviceName, methodName string, req, resp thrift.TStruct) (success bool, err error)
}

// TChanServer abstracts handling of an RPC that is implemented by the generated server code.
type TChanServer interface {
	// Handle should read the request from the given reqReader, and return the response struct.
	// The arguments returned are success, result struct, unexpected error
	Handle(ctx Context, methodName string, protocol thrift.TProtocol) (success bool, resp thrift.TStruct, err error)

	// Service returns the service name.
	Service() string

	// Methods returns the method names handled by this server.
	Methods() []string
}

// TChanStreamingServer abstracts handling of an RPC that is implemented by the generated code.
type TChanStreamingServer interface {
	// Handle handles a call (arg2 and arg3 whould already be read??)
	Handle(ctx Context, call *tchannel.InboundCall) error

	// Service returns the service name.
	Service() string

	// Methods returns the method names handled by this server.
	Methods() []string
}

type TChanStreamingClient interface {
	StartCall(ctx Context, name string) (*tchannel.OutboundCall, tchannel.ArgWriter, error)

	// TODO(prashant): Move all methods below this out of this interface.

	WriteHeaders(writer io.Writer, headers map[string]string) error
	ReadHeaders(r io.Reader) (map[string]string, error)

	// WriteStreamStruct writes the given struct as a streaming struct (e.g. length prefixed).
	WriteStreamStruct(writer io.Writer, s thrift.TStruct) error
	ReadStreamStruct(reader io.Reader, f func(protocol thrift.TProtocol) error) error

	// ReadStruct is used to read a single non-streaming Thrift struct.
	ReadStruct(reader io.ReadCloser, f func(protocol thrift.TProtocol) error) error

	// WriteStruct is used to write a single non-streaming Thrift struct.
	WriteStruct(writer tchannel.ArgWriter, s thrift.TStruct) error
}
