package json

import "golang.org/x/net/context"

// Context is a JSON Context which contains request and response headers.
// TODO(prashant): Merge common Context functionality with Thrift Context.
type Context interface {
	context.Context

	// Headers returns the call request headers.
	Headers() map[string]string

	// ResponseHeaders returns the call response headers.
	ResponseHeaders() map[string]string

	// SetResponseHeaders sets the given response headers on the context.
	SetResponseHeaders(headers map[string]string)
}

type jsonCtx struct {
	context.Context
	reqHeaders  map[string]string
	respHeaders map[string]string
}

// GetHeaders gets application headers out of the context.
func (c *jsonCtx) Headers() map[string]string {
	return c.reqHeaders
}

// ResponseHeaders returns the response headers.
func (c *jsonCtx) ResponseHeaders() map[string]string {
	return c.respHeaders
}

// SetResponseHeaders sets the response headers.
func (c *jsonCtx) SetResponseHeaders(headers map[string]string) {
	c.respHeaders = headers
}

// NewContext returns a Context that can be used to make JSON calls.
func NewContext(ctx context.Context) Context {
	return &jsonCtx{
		Context: ctx,
	}
}

// WithHeaders returns a Context that can be used to make a call with request headers.
func WithHeaders(ctx context.Context, headers map[string]string) Context {
	return &jsonCtx{
		Context:    ctx,
		reqHeaders: headers,
	}
}
