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
	"reflect"

	"github.com/apache/thrift/lib/go/thrift"
	tchannel "github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// Server is a Thrift over TChannel server.
type Server struct {
	*tchannel.Channel
}

// NewServer returns a server that can serve thrift services over TChannel.
func NewServer(tchan *tchannel.Channel) *Server {
	return &Server{tchan}
}

// Register registers the given processor's methods as handlers with this server.
// E.g., a processor 'myProcessor' with methods 'foo' and 'bar' will be registered
// under the operations 'myProcessor::foo' and 'myProcessor::bar'.
func (s *Server) Register(thriftName string, processorInterface reflect.Type, processor thrift.TProcessor) {
	handler := &Handler{processor}
	for i := 0; i < processorInterface.NumMethod(); i++ {
		methodName := processorInterface.Method(i).Name
		s.Channel.Register(handler, thriftName+"::"+methodName)
	}
}

// Handler wraps the tchannel.Handler interface around the Thrift processor.
type Handler struct {
	processor thrift.TProcessor
}

// Handle takes a tchannel call request and handles it using the Thrift processor with
// a tchannel protocol.
func (h *Handler) Handle(ctx context.Context, call *tchannel.InboundCall) {
	protocol := NewTChannelInbound(call)
	h.processor.Process(protocol, protocol)
}
