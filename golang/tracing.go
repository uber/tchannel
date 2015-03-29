package tchannel

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
	"fmt"
	"math/rand"
	"time"

	"github.com/uber/tchannel/golang/typed"
	"golang.org/x/net/context"
)

var (
	rng = rand.New(rand.NewSource(time.Now().UnixNano()))
)

// Span represents Zipkin-style span
type Span struct {
	traceID  uint64
	parentID uint64
	spanID   uint64
	flags    byte
}

func (s Span) String() string {
	return fmt.Sprintf("TraceID=%d,ParentID=%d,SpanID=%d", s.traceID, s.parentID, s.spanID)
}

func (s *Span) read(r *typed.ReadBuffer) error {
	var err error
	s.traceID, err = r.ReadUint64()
	if err != nil {
		return err
	}

	s.parentID, err = r.ReadUint64()
	if err != nil {
		return err
	}

	s.spanID, err = r.ReadUint64()
	if err != nil {
		return err
	}

	s.flags, err = r.ReadByte()
	if err != nil {
		return err
	}

	return nil
}

func (s *Span) write(w *typed.WriteBuffer) error {
	if err := w.WriteUint64(s.traceID); err != nil {
		return err
	}

	if err := w.WriteUint64(s.parentID); err != nil {
		return err
	}

	if err := w.WriteUint64(s.spanID); err != nil {
		return err
	}

	if err := w.WriteByte(s.flags); err != nil {
		return err
	}

	return nil
}

const (
	tracingFlagEnabled byte = 0x01
	tracingKey              = "tracing"
)

// NewRootSpan creates a new top-level Span for a call-graph within the provided context
func NewRootSpan() *Span {
	return &Span{traceID: uint64(rng.Int63())}
}

// TraceID returns the trace id for the entire call graph of requests. Established at the outermost
// edge service and propagated through all calls
func (s Span) TraceID() uint64 { return s.traceID }

// ParentID returns the id of the parent span in this call graph
func (s Span) ParentID() uint64 { return s.parentID }

// SpanID returns the id of this specific RPC
func (s Span) SpanID() uint64 { return s.spanID }

// EnableTracing controls whether tracing is enabled for this context
func (s *Span) EnableTracing(enabled bool) {
	if enabled {
		s.flags |= tracingFlagEnabled
	} else {
		s.flags &= ^tracingFlagEnabled
	}
}

// TracingEnabled checks whether tracing is enabled for this context
func (s Span) TracingEnabled() bool { return (s.flags & tracingFlagEnabled) == tracingFlagEnabled }

// NewChildSpan begins a new child span in the provided Context
func (s Span) NewChildSpan() *Span {
	return &Span{
		traceID:  s.traceID,
		parentID: s.spanID,
		spanID:   uint64(rng.Int63()),
		flags:    s.flags,
	}
}

// NewRootContext creates a new root context for making outbound calls
func NewRootContext(ctx context.Context) context.Context {
	return context.WithValue(ctx, tracingKey, NewRootSpan())
}

// CurrentSpan returns the Span value for the provided Context
func CurrentSpan(ctx context.Context) *Span {
	if span := ctx.Value(tracingKey); span != nil {
		return span.(*Span)
	}

	return nil
}
