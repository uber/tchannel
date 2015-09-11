package thrift

import (
	"fmt"

	athrift "github.com/apache/thrift/lib/go/thrift"
	"github.com/uber/tchannel/golang/thrift/gen-go/meta"
)

// TChanMeta is interface for the service and client for the services defined in the IDL.
type TChanMeta interface {
	Health(ctx Context) (*meta.HealthStatus, error)
}

// Implementation of a client and service handler.

type tchanMetaClient struct {
	client TChanClient
}

// NewTChanMetaClient creates new tchanMetaClient instance.
func NewTChanMetaClient(client TChanClient) TChanMeta {
	return &tchanMetaClient{client: client}
}

func (c *tchanMetaClient) Health(ctx Context) (*meta.HealthStatus, error) {
	var resp meta.HealthResult
	args := meta.HealthArgs{}
	success, err := c.client.Call(ctx, "Meta", "health", &args, &resp)
	if err == nil && !success {
	}

	return resp.GetSuccess(), err
}

type tchanMetaServer struct {
	handler TChanMeta
}

// NewTChanMetaServer creates new instance of tchanMetaServer.
func NewTChanMetaServer(handler TChanMeta) TChanServer {
	return &tchanMetaServer{handler}
}

func (s *tchanMetaServer) Service() string {
	return "Meta"
}

func (s *tchanMetaServer) Methods() []string {
	return []string{
		"health",
	}
}

func (s *tchanMetaServer) Handle(ctx Context, methodName string, protocol athrift.TProtocol) (bool, athrift.TStruct, error) {
	switch methodName {
	case "health":
		return s.handleHealth(ctx, protocol)
	default:
		return false, nil, fmt.Errorf("method %v not found in service %v", methodName, s.Service())
	}
}

func (s *tchanMetaServer) handleHealth(ctx Context, protocol athrift.TProtocol) (bool, athrift.TStruct, error) {
	var req meta.HealthArgs
	var res meta.HealthResult

	if err := req.Read(protocol); err != nil {
		return false, nil, err
	}

	r, err :=
		s.handler.Health(ctx)

	if err != nil {
		return false, nil, err
	}

	res.Success = r

	return err == nil, &res, nil
}
