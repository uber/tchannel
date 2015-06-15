package hyperbahn

import (
	"errors"
	"time"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// Client manages Hyperbahn connections and registrations.
type Client struct {
	tchan *tchannel.Channel
	opts  ClientOptions
}

// FailStrategy is the strategy to use when registration fails maxRegistrationFailures
// times consecutively in the background. This is not used if the initial registration fails.
type FailStrategy int

const (
	// FailStrategyFatal will call Fatalf on the channel's logger after triggerring handler.OnError.
	// This is the default strategy.
	FailStrategyFatal FailStrategy = iota
	// FailStrategyIgnore will only call handler.OnError, even on fatal errors.
	FailStrategyIgnore
)

const hyperbahnServiceName = "hyperbahn"

// ClientOptions are used to configure this Hyperbahn client.
type ClientOptions struct {
	Timeout      time.Duration
	Handler      Handler
	FailStrategy FailStrategy
}

// ErrAppError is returned if there was an application error during registration.
// TODO(prashant): Check if there is more information returned that we can use.
var ErrAppError = errors.New("app error")

// NewClient creates a new Hyperbahn client using the given channel.
// initialNodes is a list of hostPort strings identifying the initial Hyperbahn nodes to connect to.
// opts are optional, and are used to customize the client.
func NewClient(ch *tchannel.Channel, initialNodes []string, opts *ClientOptions) *Client {
	client := &Client{tchan: ch}
	if opts != nil {
		client.opts = *opts
	}
	if client.opts.Handler == nil {
		client.opts.Handler = nullHandler{}
	}

	// Add the given initial nodes as peers.
	for _, node := range initialNodes {
		addPeer(ch, node)
	}

	return client
}

// addPeer registers a peer in the Hyperbahn subchannel.
// TODO(prashant): Start connections to the peers in the background.
func addPeer(ch *tchannel.Channel, hostPort string) {
	peers := ch.GetSubChannel(hyperbahnServiceName).Peers()
	peers.Add(hostPort)
}

// Register registers the service to Hyperbahn, and returns any errors on initial registration.
// If the registration succeeds, a goroutine is started to refresh the registration periodically.
func (c *Client) Register() error {
	if err := c.sendRegistration(); err != nil {
		return err
	}
	c.opts.Handler.On(Registered)
	go c.registrationLoop()
	return nil
}

// TODO(prashant): Move the JSON call logic to a common tchannel location.
func makeJSONCall(ctx context.Context, sc *tchannel.SubChannel, operation string, arg interface{}, resp interface{}) error {
	call, err := sc.BeginCall(ctx, operation, &tchannel.CallOptions{
		Format: tchannel.JSON,
	})
	if err != nil {
		return err
	}

	if err := tchannel.NewArgWriter(call.Arg2Writer()).Write(nil); err != nil {
		return err
	}
	if err := tchannel.NewArgWriter(call.Arg3Writer()).WriteJSON(arg); err != nil {
		return err
	}

	// Call Arg2Reader before application error.
	var arg2 []byte
	if err := tchannel.NewArgReader(call.Response().Arg2Reader()).Read(&arg2); err != nil {
		return err
	}
	if call.Response().ApplicationError() {
		return ErrAppError
	}
	if err := tchannel.NewArgReader(call.Response().Arg3Reader()).ReadJSON(resp); err != nil {
		return err
	}

	return nil
}
