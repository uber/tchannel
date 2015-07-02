package tchannel

import (
	"time"

	"golang.org/x/net/context"
)

// NewContext returns a new root context used to make TChannel requests.
func NewContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	tctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx := context.WithValue(tctx, tracingKey, NewRootSpan())
	return ctx, cancel
}
