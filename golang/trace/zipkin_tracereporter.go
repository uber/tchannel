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

// ZipkinTraceReporter is a trace reporter that submits trace spans in to zipkin trace server.
type ZipkinTraceReporter struct {
	tchannel *tc.Channel
}

// Report method will submit trace span to tcollector server.
func (r *ZipkinTraceReporter) Report(
	span tc.Span, annotations []tc.Annotation, binaryAnnotations []tc.BinaryAnnotation, name string, endpoint *tc.Endpoint) {

	thriftClient := thrift.NewClient(r.tchannel, "tcollector", nil)
	client := tcollector.NewTChanTCollectorClient(thriftClient)

	ctx, cancel := tc.NewContextBuilder(time.Second).
		SetShardKey(Base64Encode(span.TraceID())).Build()
	defer cancel()

	thriftSpan := BuildZipkinSpan(span, annotations, binaryAnnotations, name, endpoint)
	// client submit
	client.Submit(ctx, thriftSpan)
}

// BuildZipkinSpan builds zipkin span based on tchannel span.
func BuildZipkinSpan(span tc.Span, annotations []tc.Annotation, binaryAnnotations []tc.BinaryAnnotation, name string, endpoint *tc.Endpoint) *tcollector.Span {

	host := tcollector.Endpoint{
		Ipv4:        (int32)(InetAton(endpoint.Ipv4)),
		Port:        endpoint.Port,
		ServiceName: endpoint.ServiceName,
	}

	// TODO Add BinaryAnnotations
	thriftSpan := tcollector.Span{
		TraceId:     UInt64ToBytes(span.TraceID()),
		Host:        &host,
		Name:        name,
		Id:          UInt64ToBytes(span.SpanID()),
		ParentId:    UInt64ToBytes(span.ParentID()),
		Annotations: BuildZipkinAnnotations(annotations),
		Debug:       false,
	}

	return &thriftSpan

}

// BuildZipkinAnnotations builds zipkin Annotations based on tchannel annotations.
func BuildZipkinAnnotations(anns []tc.Annotation) []*tcollector.Annotation {
	zipkinAnns := make([]*tcollector.Annotation, len(anns))

	for i, ann := range anns {
		zipkinAnns[i] = &tcollector.Annotation{
			Timestamp: (float64)(ann.Timestamp.UnixNano() / 1e6),
			Value:     (string)(ann.Key),
		}
	}
	return zipkinAnns
}

// InetAton converts string Ipv4 to uint32
func InetAton(ip string) uint32 {
	ipByte := net.ParseIP(ip).To4()
	var ipInt uint32
	for i := 0; i < len(ipByte); i++ {
		ipInt |= uint32(ipByte[i])
		if i < 3 {
			ipInt <<= 8
		}
	}
	return ipInt
}

// Base64Encode encodes uint64 with base64 StdEncoding.
func Base64Encode(data uint64) string {
	return base64.StdEncoding.EncodeToString(UInt64ToBytes(data))
}

// UInt64ToBytes converts uint64 to bytes.
func UInt64ToBytes(i uint64) []byte {
	var buf = make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(i))
	return buf
}

// ZipkinTraceReporterFactory builds ZipkinTraceReporter by given TChannel instance.
func ZipkinTraceReporterFactory(tchannel *tc.Channel) tc.TraceReporter {
	return &ZipkinTraceReporter{tchannel}
}
