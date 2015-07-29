package tchannel

import (
	"log"
	"time"
)

// When reporting spans, we report:
// bunch of "binary" annotations (eg

// AnnotationKey is the key for annotations.
type AnnotationKey string

// Known annotation keys
const (
	AnnotationKeyClientSend    = "cs"
	AnnotationKeyClientReceive = "cr"
	AnnotationKeyServerSend    = "ss"
	AnnotationKeyServerReceive = "sr"
)

// BinaryAnnotation is additional context information about the span.
type BinaryAnnotation struct {
	Key string
	// Value contains one of: string, float64, bool, []byte, int64
	Value interface{}
}

// Annotation represents a specific event and the timestamp at which it occurred.
type Annotation struct {
	Key       AnnotationKey
	Timestamp time.Time
}

// NewAnnotation returns a new annotation.
func NewAnnotation(key AnnotationKey) Annotation {
	return Annotation{Key: key, Timestamp: timeNow()}
}

// NewBinaryAnnotation returns a new binary annotation.
func NewBinaryAnnotation(key string, value interface{}) BinaryAnnotation {
	return BinaryAnnotation{Key: key, Value: value}
}

// TraceReporter is the interface used to report Trace spans.
type TraceReporter interface {
	Report(span Span, annotations []Annotation, binaryAnnotations []BinaryAnnotation)
}

// NullReporter is the default TraceReporter which does not do anything.
var NullReporter TraceReporter = nullReporter{}

type nullReporter struct{}

func (nullReporter) Report(_ Span, _ []Annotation, _ []BinaryAnnotation) {}

// SimpleTraceReporter is a trace reporter which prints using the default logger.
var SimpleTraceReporter TraceReporter = simpleTraceReporter{}

type simpleTraceReporter struct{}

func (simpleTraceReporter) Report(span Span, annotations []Annotation, binaryAnnotations []BinaryAnnotation) {
	log.Printf("SimpleTraceReporter.Report span: %+v annotations: %+v binaryAnnotations: %+v",
		span, annotations, binaryAnnotations)
}

// Annotations is am embeddable struct used to track annotations.
type Annotations struct {
	binaryAnnotations []BinaryAnnotation
	annotations       []Annotation
}

// AddBinaryAnnotation adds a binary annotation.
func (as *Annotations) AddBinaryAnnotation(binaryAnnotation BinaryAnnotation) {
	as.binaryAnnotations = append(as.binaryAnnotations, binaryAnnotation)
}

// AddAnnotation adds a standard annotation.
func (as *Annotations) AddAnnotation(key AnnotationKey) {
	as.annotations = append(as.annotations, NewAnnotation(key))
}

// Report reports the annotations to the given trace reporter.
func (as *Annotations) Report(span Span, reporter TraceReporter) {
	reporter.Report(span, as.annotations, as.binaryAnnotations)
}
