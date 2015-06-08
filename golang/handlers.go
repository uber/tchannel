package tchannel

import (
	"sync"

	"golang.org/x/net/context"
)

// A Handler is an object that can be registered with a Channel to process
// incoming calls for a given service and operation
type Handler interface {
	// Handles an incoming call for service
	Handle(ctx context.Context, call *InboundCall)
}

// A HandlerFunc is an adapter to allow the use of ordering functions as
// Channel handlers.  If f is a function with the appropriate signature,
// HandlerFunc(f) is a Hander object that calls f
type HandlerFunc func(ctx context.Context, call *InboundCall)

// Handle calls f(ctx, call)
func (f HandlerFunc) Handle(ctx context.Context, call *InboundCall) { f(ctx, call) }

// Manages handlers
type handlerMap struct {
	mut      sync.RWMutex
	handlers map[string]map[string]Handler
}

// Registers a handler
func (hmap *handlerMap) register(h Handler, serviceName, operation string) {
	hmap.mut.Lock()
	defer hmap.mut.Unlock()

	if hmap.handlers == nil {
		hmap.handlers = make(map[string]map[string]Handler)
	}

	operations := hmap.handlers[serviceName]
	if operations == nil {
		operations = make(map[string]Handler)
		hmap.handlers[serviceName] = operations
	}

	operations[operation] = h
}

// Finds the handler matching the given service and operation.  See https://github.com/golang/go/issues/3512
// for the reason that operation is []byte instead of a string
func (hmap *handlerMap) find(serviceName string, operation []byte) Handler {
	hmap.mut.RLock()
	defer hmap.mut.RUnlock()

	return hmap.handlers[serviceName][string(operation)]
}
