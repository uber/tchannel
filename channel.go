package tchannel

import (
	"net"
	"time"

	"code.google.com/p/go.net/context"
	"github.com/op/go-logging"
)

// Handler for incoming calls
type Handler interface {
	// Handles an incoming call for service
	Handle(ctx context.Context, call *InboundCall)
}

// A handler which is just a function
type HandlerFunc func(ctx context.Context, call *InboundCall)

// Creates a Handler around a HandlerFunc
func HandleFunc(f HandlerFunc) Handler {
	return &funcHandler{f}
}

type funcHandler struct {
	f HandlerFunc
}

func (h *funcHandler) Handle(ctx context.Context, call *InboundCall) {
	h.f(ctx, call)
}

// Options used to create a TChannel
type TChannelOptions struct {
	// Default Connection options
	DefaultConnectionOptions TChannelConnectionOptions

	// The name of the process, for logging and reporting to peers
	ProcessName string

	// The logger to use for this channel
	Logger *logging.Logger
}

// A TChannel is a bi-directional connection to the peering and routing network.  Applications
// can use a TChannel to make service calls to remote peers via BeginCall, or to listen for incoming calls
// from peers.  Once the channel is created, applications should call the ListenAndHandle method to
// listen for incoming peer connections.  Because channels are bi-directional, applications should call
// ListenAndHandle even if they do not offer any services
type TChannel struct {
	log               *logging.Logger
	hostPort          string
	processName       string
	workerPoolSize    int
	connectionOptions TChannelConnectionOptions
	handlers          handlerMap
	l                 net.Listener
}

// Creates a new channel bound to the given host and port
func NewChannel(hostPort string, opts *TChannelOptions) (*TChannel, error) {
	if opts == nil {
		opts = &TChannelOptions{}
	}

	logger := opts.Logger
	if logger == nil {
		logger = logging.MustGetLogger("tchannel.channel")
	}

	ch := &TChannel{
		connectionOptions: opts.DefaultConnectionOptions,
		hostPort:          hostPort,
		processName:       opts.ProcessName,
		log:               logger,
	}

	ch.connectionOptions.PeerInfo.HostPort = hostPort
	ch.connectionOptions.PeerInfo.ProcessName = ch.processName
	return ch, nil
}

// Registers a handler for a service+operation pair
func (ch *TChannel) Register(h Handler, serviceName, operationName string) {
	ch.handlers.register(h, serviceName, operationName)
}

// Begins a new call to a remote peer
func (ch *TChannel) BeginCall(ctx context.Context, hostPort,
	serviceName, operationName string) (*OutboundCall, error) {
	// TODO(mmihic): Keep-alive, manage pools, use existing inbound if possible, all that jazz
	nconn, err := net.Dial("tcp", hostPort)
	if err != nil {
		return nil, err
	}

	conn, err := newOutboundConnection(ch, nconn, &ch.connectionOptions)
	if err != nil {
		return nil, err
	}

	if err := conn.sendInit(ctx); err != nil {
		return nil, err
	}

	call, err := conn.BeginCall(ctx, serviceName)
	if err != nil {
		return nil, err
	}

	warg1, err := call.BeginArg1()
	if err != nil {
		return nil, err
	}

	if _, err := warg1.Write([]byte(operationName)); err != nil {
		return nil, err
	}

	return call, nil
}

// Runs the channel listener, accepting and managing new connections.  Blocks until the channel is closed.
func (ch *TChannel) ListenAndHandle() error {
	var err error
	ch.l, err = net.Listen("tcp", ch.hostPort)
	if err != nil {
		ch.log.Error("Could not listen on %s: %v", ch.hostPort, err)
		return err
	}

	ch.log.Info("%s listening on %s", ch.processName, ch.hostPort)
	acceptBackoff := 0 * time.Millisecond

	for {
		netConn, err := ch.l.Accept()
		if err != nil {
			// Backoff from new accepts if this is a temporary error
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				if acceptBackoff == 0 {
					acceptBackoff = 5 * time.Millisecond
				} else {
					acceptBackoff *= 2
				}
				if max := 1 * time.Second; acceptBackoff > max {
					acceptBackoff = max
				}
				ch.log.Warning("accept error: %v; retrying in %v", err, acceptBackoff)
				time.Sleep(acceptBackoff)
				continue
			} else {
				ch.log.Error("unrecoverable accept error: %v; closing server", err)
				return nil
			}
		}

		acceptBackoff = 0

		_, err = newInboundConnection(ch, netConn, &ch.connectionOptions)
		if err != nil {
			// Server is getting overloaded - begin rejecting new connections
			ch.log.Error("could not create new TChannelConnection for incoming conn: %v", err)
			netConn.Close()
			continue
		}

		// TODO(mmihic): Register connection so we can close them when the channel is closed
	}
}
