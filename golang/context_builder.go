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

package tchannel

import (
	"time"

	"golang.org/x/net/context"
)

// ContextBuilder stores all TChannel-specific parameters that will
// be stored inside of a context.
type ContextBuilder struct {
	// If Timeout is zero, Build will default to defaultTimeout.
	Timeout time.Duration

	// Headers are application headers that json/thrift will encode into arg2.
	Headers map[string]string

	// CallOptions are TChannel call options for the specific call.
	CallOptions CallOptions

	// Hidden fields: we do not want users outside of tchannel to set these.
	incomingCall IncomingCall
	span         *Span
}

// NewContextBuilder returns a builder that can be used to create a Context.
func NewContextBuilder(timeout time.Duration) *ContextBuilder {
	return &ContextBuilder{
		Timeout: timeout,
	}
}

// SetTimeout sets the timeout for the Context.
func (cb *ContextBuilder) SetTimeout(timeout time.Duration) *ContextBuilder {
	cb.Timeout = timeout
	return cb
}

// AddHeader adds a single application header to the Context.
func (cb *ContextBuilder) AddHeader(key, value string) *ContextBuilder {
	if cb.Headers == nil {
		cb.Headers = map[string]string{key: value}
	} else {
		cb.Headers[key] = value
	}
	return cb
}

// SetHeaders sets the application headers for this Context.
func (cb *ContextBuilder) SetHeaders(headers map[string]string) *ContextBuilder {
	cb.Headers = headers
	return cb
}

// SetShardKey sets the ShardKey call option ("sk" transport header).
func (cb *ContextBuilder) SetShardKey(sk string) *ContextBuilder {
	cb.CallOptions.ShardKey = sk
	return cb
}

// SetFormat sets the Format call option ("as" transport header).
func (cb *ContextBuilder) SetFormat(f Format) *ContextBuilder {
	cb.CallOptions.Format = f
	return cb
}

// SetIncomingCallForTest sets an IncomingCall in the context.
// This should only be used in unit tests.
func (cb *ContextBuilder) SetIncomingCallForTest(call IncomingCall) *ContextBuilder {
	return cb.setIncomingCall(call)
}

// SetSpanForTest sets a tracing span in the context.
// This should only be used in unit tests.
func (cb *ContextBuilder) SetSpanForTest(span *Span) *ContextBuilder {
	return cb.setSpan(span)
}

func (cb *ContextBuilder) setSpan(span *Span) *ContextBuilder {
	cb.span = span
	return cb
}

func (cb *ContextBuilder) setIncomingCall(call IncomingCall) *ContextBuilder {
	cb.incomingCall = call
	return cb
}

// Build returns a ContextWithHeaders that can be used to make calls.
func (cb *ContextBuilder) Build() (ContextWithHeaders, context.CancelFunc) {
	timeout := cb.Timeout
	if timeout == 0 {
		timeout = defaultTimeout
	}

	params := &tchannelCtxParams{
		span: cb.span,
		call: cb.incomingCall,
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	ctx = context.WithValue(ctx, contextKeyTChannel, params)
	return WrapWithHeaders(ctx, cb.Headers), cancel
}
