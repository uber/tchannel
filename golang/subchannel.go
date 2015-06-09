package tchannel

import "golang.org/x/net/context"

// SubChannel allows calling a specific service on a channel.
type SubChannel struct {
	serviceName        string
	defaultCallOptions *CallOptions
	peers              *PeerList
}

func newSubChannel(serviceName string, peers *PeerList) *SubChannel {
	return &SubChannel{
		serviceName: serviceName,
		peers:       peers,
	}
}

// ServiceName returns the service name that this subchannel is for.
func (c *SubChannel) ServiceName() string {
	return c.serviceName
}

// BeginCall starts a new call to a remote peer, returning an OutboundCall that can
// be used to write the arguments of the call
func (c *SubChannel) BeginCall(ctx context.Context, operationName string, callOptions *CallOptions) (*OutboundCall, error) {
	if callOptions == nil {
		callOptions = defaultCallOptions
	}

	p := c.peers.Get()
	conn, err := p.GetConnection(ctx)
	if err != nil {
		return nil, err
	}

	call, err := conn.beginCall(ctx, c.serviceName, callOptions)
	if err != nil {
		return nil, err
	}

	if err := call.writeOperation([]byte(operationName)); err != nil {
		return nil, err
	}

	return call, err
}
