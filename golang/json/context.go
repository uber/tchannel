package json

// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import (
	"time"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

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

// NewContext returns a Context that can be used to make JSON calls.
func NewContext(timeout time.Duration) (Context, context.CancelFunc) {
	tctx, cancel := tchannel.NewContext(timeout)
	return &jsonCtx{
		Context: tctx,
	}, cancel
}

// WithHeaders returns a Context that can be used to make a call with request headers.
func WithHeaders(ctx context.Context, headers interface{}) Context {
	return &jsonCtx{
		Context:    ctx,
		reqHeaders: headers,
	}
}
