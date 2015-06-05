package thrift

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
		s.Channel.Register(handler, s.Channel.PeerInfo().ServiceName, thriftName+"::"+methodName)
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
