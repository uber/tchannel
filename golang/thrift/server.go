package thrift

import tchannel "github.com/uber/tchannel/golang"
import "golang.org/x/net/context"
import "github.com/apache/thrift/lib/go/thrift"

// Server is a thrift-over-tchannel server.
type Server struct {
	serviceName string
	tchannel    *tchannel.Channel
}

func (s *Server) Register(processorName string, processor thrift.TProcessor) {
	// operation-level dispatching is done by the thrift processor
	s.tchannel.Register(&ThriftService{processor}, s.serviceName, processorName)
}

func (s *Server) ListenAndServe() error {
	return s.tchannel.ListenAndHandle()
}

func (s *Server) Stop() error {
	// TODO
	return nil
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

// ThriftService wraps the tchannel.Handler interface
// around the thrift processor
type ThriftService struct {
	processor thrift.TProcessor
}

func (s *ThriftService) Handle(ctx context.Context, call *tchannel.InboundCall) {
	protocol := NewTChannelInboundProtocol(call)
	s.processor.Process(protocol, protocol)
}
