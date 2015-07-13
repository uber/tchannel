package tchannel

import (
	"time"

	"golang.org/x/net/context"
)

type contextKey int

const (
	contextKeyUnknown contextKey = iota
	contextKeyTracing
	contextKeyCall
)

// IncomingCall exposes properties for incoming calls through the context.
type IncomingCall interface {
	// CallerName returns the caller name from the CallerName transport header.
	CallerName() string
}

// NewContext returns a new root context used to make TChannel requests.
func NewContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	tctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx := context.WithValue(tctx, contextKeyTracing, NewRootSpan())
	return ctx, cancel
}

// WrapContextForTest returns a copy of the given Context that is associated with the call.
// This should be used in units test only.
func WrapContextForTest(ctx context.Context, call IncomingCall) context.Context {
	return context.WithValue(ctx, contextKeyCall, call)
}

// newIncomingContext creates a new context for an incoming call with the given span.
func newIncomingContext(call IncomingCall, timeout time.Duration, span *Span) (context.Context, context.CancelFunc) {
	tctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx := context.WithValue(tctx, contextKeyTracing, span)
	ctx = context.WithValue(ctx, contextKeyCall, call)
	return ctx, cancel
}

// CurrentCall returns the current incoming call, or nil if this is not an incoming call context.
func CurrentCall(ctx context.Context) IncomingCall {
	if v := ctx.Value(contextKeyCall); v != nil {
		return v.(IncomingCall)
	}
	return nil
}
