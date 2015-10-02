package thrift

import (
	"fmt"

	athrift "github.com/apache/thrift/lib/go/thrift"
	"github.com/uber/tchannel/golang/thrift/gen-go/meta"
)

// tchanMeta is interface for the service and client for the services defined in the IDL.
type tchanMeta interface {
	Health(ctx Context) (*meta.HealthStatus, error)
}

// Implementation of a client and service handler.

type tchanMetaClient struct {
	client TChanClient
}

// newTChanMetaClient creates new tchanMetaClient instance.
func newTChanMetaClient(client TChanClient) tchanMeta {
	return &tchanMetaClient{client: client}
}

func (c *tchanMetaClient) Health(ctx Context) (*meta.HealthStatus, error) {
	var resp meta.MetaHealthResult
	args := meta.MetaHealthArgs{}
	success, err := c.client.Call(ctx, "Meta", "health", &args, &resp)
	if err == nil && !success {
	}

	return resp.GetSuccess(), err
}

type tchanMetaServer struct {
	handler tchanMeta
}

// newTChanMetaServer creates new instance of tchanMetaServer.
func newTChanMetaServer(handler tchanMeta) TChanServer {
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
	var req meta.MetaHealthArgs
	var res meta.MetaHealthResult

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
