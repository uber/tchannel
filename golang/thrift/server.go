package thrift

import "reflect"
import tchannel "github.com/uber/tchannel/golang"
import "golang.org/x/net/context"
import "github.com/apache/thrift/lib/go/thrift"

// Server is a thrift-over-tchannel server.
type Server struct {
	serviceName string
	tchannel    *tchannel.Channel
}

func (s *Server) Register(processorName string, processorType reflect.Type, processor thrift.TProcessor) {
	// all methods of the processor is handled by the same handler
	handler := &ThriftHandler{processor}
	for i := 0; i < processorType.NumMethod(); i++ {
		methodName := processorType.Method(i).Name
		s.tchannel.Register(handler, s.serviceName, processorName+"::"+methodName)
	}
}

func (s *Server) ListenAndServe() error {
	return s.tchannel.ListenAndHandle()
}

func (s *Server) Stop() error {
	return s.tchannel.Stop()
}

func (s *Server) HostPort() string {
	return s.tchannel.HostPort()
}

// NewServer creates a service that speaks thrift over tchannel.
func NewServer(bindAddr, serviceName string) (*Server, error) {
	ch, err := tchannel.NewChannel(bindAddr, &tchannel.ChannelOptions{})
	if err != nil {
		return nil, err
	}

	return &Server{serviceName, ch}, nil
}

// ThriftHandler wraps the tchannel.Handler interface
// around the thrift processor
type ThriftHandler struct {
	processor thrift.TProcessor
}

func (s *ThriftHandler) Handle(ctx context.Context, call *tchannel.InboundCall) {
	protocol := NewTChannelInboundProtocol(call)
	s.processor.Process(protocol, protocol)
}
