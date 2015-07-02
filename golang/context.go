package tchannel

import (
	"time"

	"golang.org/x/net/context"
)

type contextKey int

const (
	contextKeyUnknown contextKey = iota
	contextKeyTracing
)

// NewContext returns a new root context used to make TChannel requests.
func NewContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	tctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx := context.WithValue(tctx, contextKeyTracing, NewRootSpan())
	return ctx, cancel
}

// newIncomingContext creates a new context for an incoming call with the given span.
func newIncomingContext(timeout time.Duration, span *Span) (context.Context, context.CancelFunc) {
	tctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx := context.WithValue(tctx, contextKeyTracing, span)
	return ctx, cancel
}
