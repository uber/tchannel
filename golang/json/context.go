package json

import "golang.org/x/net/context"

// Context is a JSON Context which contains request and response headers.
type Context interface {
	context.Context

	// Headers returns the call request headers.
	Headers() interface{}

	// ResponseHeaders returns the call response headers.
	ResponseHeaders() interface{}

	// SetResponseHeaders sets the given response headers on the context.
	SetResponseHeaders(headers interface{})
}

type jsonCtx struct {
	context.Context
	reqHeaders  interface{}
	respHeaders interface{}
}

// Headers gets application headers out of the context.
func (c *jsonCtx) Headers() interface{} {
	return c.reqHeaders
}

// ResponseHeaders returns the response headers.
func (c *jsonCtx) ResponseHeaders() interface{} {
	return c.respHeaders
}

// SetResponseHeaders sets the response headers.
func (c *jsonCtx) SetResponseHeaders(headers interface{}) {
	c.respHeaders = headers
}

// WrapContext returns a Context that can be used to make JSON calls.
func WrapContext(ctx context.Context) Context {
	return &jsonCtx{
		Context: ctx,
	}
}

// WithHeaders returns a Context that can be used to make a call with request headers.
func WithHeaders(ctx context.Context, headers interface{}) Context {
	return &jsonCtx{
		Context:    ctx,
		reqHeaders: headers,
	}
}
