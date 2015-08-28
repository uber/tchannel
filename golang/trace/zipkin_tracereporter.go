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

// Package trace provides methods to submit Zipkin style Span to tcollector Server.
package trace

import (
	"encoding/base64"
	"encoding/binary"
	"net"
	"time"

	tc "github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/thrift"
	"github.com/uber/tchannel/golang/trace/thrift/gen-go/tcollector"
)

const tcollectorServiceName = "tcollector"

// ZipkinTraceReporter is a trace reporter that submits trace spans in to zipkin trace server.
type ZipkinTraceReporter struct {
	tchannel *tc.Channel
	client   tcollector.TChanTCollector
}

// NewZipkinTraceReporter returns a zipkin trace reporter that submits span to tcollector service.
func NewZipkinTraceReporter(ch *tc.Channel) *ZipkinTraceReporter {
	thriftClient := thrift.NewClient(ch, tcollectorServiceName, nil)
	client := tcollector.NewTChanTCollectorClient(thriftClient)
	return &ZipkinTraceReporter{tchannel: ch, client: client}
}

// Report method will submit trace span to tcollector server.
func (r *ZipkinTraceReporter) Report(
	span tc.Span, annotations []tc.Annotation, binaryAnnotations []tc.BinaryAnnotation) error {
	ctx, cancel := tc.NewContextBuilder(time.Second).
		SetShardKey(base64Encode(span.TraceID())).Build()
	defer cancel()

	// FIXME remove this dummy endpoint.
	endpoint := &tc.Endpoint{Ipv4: "127.0.0.1", Port: 8888, ServiceName: "test"}
	thriftSpan := buildZipkinSpan(span, annotations, binaryAnnotations, "test", endpoint)
	// client submit
	// ignore the response result because TChannel shouldn't care about it.
	_, err := r.client.Submit(ctx, thriftSpan)
	return err
}

// buildZipkinSpan builds zipkin span based on tchannel span.
func buildZipkinSpan(span tc.Span, annotations []tc.Annotation, binaryAnnotations []tc.BinaryAnnotation, name string, endpoint *tc.Endpoint) *tcollector.Span {
	host := tcollector.Endpoint{
		Ipv4:        (int32)(inetAton(endpoint.Ipv4)),
		Port:        endpoint.Port,
		ServiceName: endpoint.ServiceName,
	}

	// TODO Add BinaryAnnotations
	thriftSpan := tcollector.Span{
		TraceId:     uint64ToBytes(span.TraceID()),
		Host:        &host,
		Name:        name,
		Id:          uint64ToBytes(span.SpanID()),
		ParentId:    uint64ToBytes(span.ParentID()),
		Annotations: buildZipkinAnnotations(annotations),
		Debug:       false,
	}

	return &thriftSpan
}

// buildZipkinAnnotations builds zipkin Annotations based on tchannel annotations.
func buildZipkinAnnotations(anns []tc.Annotation) []*tcollector.Annotation {
	zipkinAnns := make([]*tcollector.Annotation, len(anns))
	for i, ann := range anns {
		zipkinAnns[i] = &tcollector.Annotation{
			Timestamp: (float64)(ann.Timestamp.UnixNano() / 1e6),
			Value:     (string)(ann.Key),
		}
	}
	return zipkinAnns
}

// inetAton converts string Ipv4 to uint32
func inetAton(ip string) uint32 {
	ipBytes := net.ParseIP(ip).To4()
	return binary.BigEndian.Uint32(ipBytes)
}

// base64Encode encodes uint64 with base64 StdEncoding.
func base64Encode(data uint64) string {
	return base64.StdEncoding.EncodeToString(uint64ToBytes(data))
}

// uint64ToBytes converts uint64 to bytes.
func uint64ToBytes(i uint64) []byte {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(i))
	return buf
}

// ZipkinTraceReporterFactory builds ZipkinTraceReporter by given TChannel instance.
func ZipkinTraceReporterFactory(tchannel *tc.Channel) tc.TraceReporter {
	return NewZipkinTraceReporter(tchannel)
}
