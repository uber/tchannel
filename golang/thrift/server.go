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
	"log"
	"strings"
	"sync"

	"github.com/apache/thrift/lib/go/thrift"
	tchannel "github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// Server handles incoming TChannel calls and forwards them to the matching TChanServer.
type Server struct {
	ch            tchannel.Registrar
	log           tchannel.Logger
	mut           sync.RWMutex
	handlers      map[string]TChanServer
	healthHandler *healthHandler
}

// NewServer returns a server that can serve thrift services over TChannel.
func NewServer(registrar tchannel.Registrar) *Server {
	healthHandler := newHealthHandler()
	server := &Server{
		ch:            registrar,
		log:           registrar.Logger(),
		handlers:      make(map[string]TChanServer),
		healthHandler: healthHandler,
	}

	server.Register(newTChanMetaServer(healthHandler))
	return server
}

// Register registers the given TChanServer to be called on any incoming call for its' services.
// TODO(prashant): Replace Register call with this call.
func (s *Server) Register(svr TChanServer) {
	service := svr.Service()

	s.mut.Lock()
	s.handlers[service] = svr
	s.mut.Unlock()

	for _, m := range svr.Methods() {
		s.ch.Register(s, service+"::"+m)
	}
}

// RegisterHealthHandler registers User health endpoint handler into TChannel.
func (s *Server) RegisterHealthHandler(f HealthFunc) {
	s.healthHandler.setHandler(f)
}

func (s *Server) onError(err error) {
	// TODO(prashant): Expose incoming call errors through options for NewServer.
	s.log.Errorf("thrift Server error: %v", err)
}

func (s *Server) handle(origCtx context.Context, handler TChanServer, method string, call *tchannel.InboundCall) error {
	reader, err := call.Arg2Reader()
	if err != nil {
		return err
	}
	headers, err := readHeaders(reader)
	if err != nil {
		return err
	}
	if err := reader.Close(); err != nil {
		return err
	}

	reader, err = call.Arg3Reader()
	if err != nil {
		return err
	}

	ctx := WithHeaders(origCtx, headers)
	protocol := thrift.NewTBinaryProtocolTransport(&readWriterTransport{Reader: reader})
	success, resp, err := handler.Handle(ctx, method, protocol)
	if err != nil {
		reader.Close()
		call.Response().SendSystemError(err)
		return nil
	}
	if err := reader.Close(); err != nil {
		return err
	}

	if !success {
		call.Response().SetApplicationError()
	}

	writer, err := call.Response().Arg2Writer()
	if err != nil {
		return err
	}

	if err := writeHeaders(writer, ctx.ResponseHeaders()); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	writer, err = call.Response().Arg3Writer()
	protocol = thrift.NewTBinaryProtocolTransport(&readWriterTransport{Writer: writer})
	resp.Write(protocol)
	if err := writer.Close(); err != nil {
		return err
	}

	return nil
}

// Handle handles an incoming TChannel call and forwards it to the correct handler.
func (s *Server) Handle(ctx context.Context, call *tchannel.InboundCall) {
	parts := strings.Split(string(call.Operation()), "::")
	if len(parts) != 2 {
		log.Fatalf("Handle got call for %v which does not match the expected call format", parts)
	}

	service, method := parts[0], parts[1]
	s.mut.RLock()
	handler, ok := s.handlers[service]
	s.mut.RUnlock()
	if !ok {
		log.Fatalf("Handle got call for service %v which is not registered", service)
	}

	if err := s.handle(ctx, handler, method, call); err != nil {
		s.onError(err)
	}
}
