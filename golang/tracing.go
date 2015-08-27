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
	"fmt"
	"time"

	"github.com/uber/tchannel/golang/typed"
)

var (
	// timeNow is a variable for stubbing in unit tests.
	timeNow = time.Now
	// traceRng is a thread-safe random number generator for generating trace IDs.
	traceRng = NewRand(time.Now().UnixNano())
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
	s.traceID = r.ReadUint64()
	s.parentID = r.ReadUint64()
	s.spanID = r.ReadUint64()
	s.flags = r.ReadSingleByte()
	return r.Err()
}

func (s *Span) write(w *typed.WriteBuffer) error {
	w.WriteUint64(s.traceID)
	w.WriteUint64(s.parentID)
	w.WriteUint64(s.spanID)
	w.WriteSingleByte(s.flags)
	return w.Err()
}

const tracingFlagEnabled byte = 0x01

// NewRootSpan creates a new top-level Span for a call-graph within the provided context
func NewRootSpan() *Span {
	return &Span{traceID: uint64(traceRng.Int63())}
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
	childSpan := &Span{
		traceID:  s.traceID,
		parentID: s.spanID,
		flags:    s.flags,
	}
	if s.spanID == 0 {
		childSpan.spanID = childSpan.traceID
	} else {
		childSpan.spanID = uint64(traceRng.Int63())
	}
	return childSpan
}
