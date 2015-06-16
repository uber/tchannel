package thrift

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

import (
	"io"
	"io/ioutil"
	"strings"

	"github.com/apache/thrift/lib/go/thrift"
	"github.com/uber/tchannel/golang"
)

// NewTChannelInbound creates a protocol used for inbound Thrift calls over TChannel.
func NewTChannelInbound(call *tchannel.InboundCall) thrift.TProtocol {
	return &inProtocol{
		protocol: newProtocol(),
		call:     call,
	}
}

type inProtocol struct {
	*protocol

	call       *tchannel.InboundCall
	arg3Writer io.WriteCloser
	arg3Reader io.ReadCloser
}

func (p *inProtocol) Method() string {
	op := string(p.call.Operation())
	sep := strings.Index(op, "::")
	return op[sep+2:]
}

func (p *inProtocol) ReadMessageBegin() (string, thrift.TMessageType, int32, error) {
	reader, err := p.call.Arg2Reader()
	if err != nil {
		return "", 0, 0, err
	}
	// TODO(prashant): Read application headers out of arg2.
	io.Copy(ioutil.Discard, reader)
	if err := reader.Close(); err != nil {
		return "", 0, 0, err
	}

	if p.arg3Reader, err = p.call.Arg3Reader(); err != nil {
		return "", 0, 0, err
	}

	p.transport.Reader = p.arg3Reader
	return p.Method(), thrift.CALL, 0, err
}

func (p *inProtocol) ReadMessageEnd() error {
	reader := p.arg3Reader
	p.arg3Reader = nil
	p.transport.Reader = nil
	return reader.Close()
}

func (p *inProtocol) WriteMessageBegin(name string, typeID thrift.TMessageType, seqID int32) error {
	resp := p.call.Response()

	if typeID == thrift.EXCEPTION {
		resp.SetApplicationError()
	}

	writer, err := resp.Arg2Writer()
	if err != nil {
		return err
	}
	// TODO(prashant): Support application headers.
	writer.Write([]byte{0, 0})
	if err := writer.Close(); err != nil {
		return err
	}

	if p.arg3Writer, err = resp.Arg3Writer(); err != nil {
		return err
	}

	p.transport.Writer = p.arg3Writer
	return nil
}

// WriteMessageEnd is called after writing out the call response.
func (p *inProtocol) WriteMessageEnd() error {
	writer := p.arg3Writer
	p.call = nil
	p.arg3Writer = nil
	p.transport.Writer = nil
	return writer.Close()
}
