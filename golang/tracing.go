package tchannel

import (
	"fmt"
	"math/rand"

	"golang.org/x/net/context"
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

const (
	tracingFlagEnabled byte = 0x01
	tracingKey              = "tracing"
)

// NewRootSpan creates a new top-level Span for a call-graph within the provided context
func NewRootSpan() *Span {
	return &Span{traceID: uint64(rand.Int63())}
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
		spanID:   uint64(rand.Int63()),
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
