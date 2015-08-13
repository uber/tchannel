package tchannel

import (
	"sync"

	"golang.org/x/net/context"
)

// SubChannel allows calling a specific service on a channel.
// TODO(prashant): Allow creating a subchannel with default call options.
// TODO(prashant): Allow registering handlers on a subchannel.
type SubChannel struct {
	serviceName        string
	topChannel         *Channel
	defaultCallOptions *CallOptions
	peers              *PeerList
	handlers           *handlerMap
}

// Map of subchannel and the corresponding service
type subChannelMap struct {
	mut         sync.RWMutex
	subchannels map[string]*SubChannel
}

func newSubChannel(serviceName string, ch *Channel) *SubChannel {
	return &SubChannel{
		serviceName: serviceName,
		peers:       ch.peers,
		topChannel:  ch,
		handlers:    &handlerMap{},
	}
}

// ServiceName returns the service name that this subchannel is for.
func (c *SubChannel) ServiceName() string {
	return c.serviceName
}

// BeginCall starts a new call to a remote peer, returning an OutboundCall that can
// be used to write the arguments of the call.
func (c *SubChannel) BeginCall(ctx context.Context, operationName string, callOptions *CallOptions) (*OutboundCall, error) {
	if callOptions == nil {
		callOptions = defaultCallOptions
	}

	return c.peers.Get().BeginCall(ctx, c.ServiceName(), operationName, callOptions)
}

// Peers returns the PeerList for this subchannel.
func (c *SubChannel) Peers() *PeerList {
	return c.peers
}

// Register registers a handler on the subchannel for a service+operation pair
func (c *SubChannel) Register(h Handler, operationName string) {
	c.handlers.register(h, c.ServiceName(), operationName)
}

// Find if a handler for the given service+operation pair exists
func (subChMap *subChannelMap) find(serviceName string, operation []byte) Handler {
	if sc, ok := subChMap.get(serviceName); ok {
		return sc.handlers.find(serviceName, operation)
	}

	return nil
}

// Register a new subchannel for the given serviceName
func (subChMap *subChannelMap) registerNewSubChannel(serviceName string, ch *Channel) *SubChannel {
	subChMap.mut.Lock()
	defer subChMap.mut.Unlock()

	if subChMap.subchannels == nil {
		subChMap.subchannels = make(map[string]*SubChannel)
	}

	if sc, ok := subChMap.subchannels[serviceName]; ok {
		return sc
	}

	sc := newSubChannel(serviceName, ch)
	subChMap.subchannels[serviceName] = sc
	return sc
}

// Get subchannel if, we have one
func (subChMap *subChannelMap) get(serviceName string) (*SubChannel, bool) {
	subChMap.mut.RLock()
	sc, ok := subChMap.subchannels[serviceName]
	subChMap.mut.RUnlock()
	return sc, ok
}

// GetOrAdd a subchannel for the given serviceName on the map
func (subChMap *subChannelMap) getOrAdd(serviceName string, ch *Channel) *SubChannel {
	if sc, ok := subChMap.get(serviceName); ok {
		return sc
	}

	return subChMap.registerNewSubChannel(serviceName, ch)
}
