package trace

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/trace/thrift/gen-go/tcollector"
)

func TestZipkinTraceReporterFactory(t *testing.T) {
	_, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger:               tchannel.SimpleLogger,
		TraceReporterFactory: tchannel.TraceReporterFactory(ZipkinTraceReporterFactory),
	})

	assert.NoError(t, err)
}

func TestBuildZipkinSpan(t *testing.T) {
	host := &tchannel.Endpoint{
		Ipv4:        "127.0.0.1",
		Port:        8888,
		ServiceName: "test",
	}
	span := *tchannel.NewRootSpan()
	name := "test"
	annotations := RandomAnnotations()
	thriftSpan := BuildZipkinSpan(span, annotations, nil, name, host)

	expectedSpan := tcollector.Span{
		TraceId: UInt64ToBytes(span.TraceID()),
		Host: &tcollector.Endpoint{
			Ipv4:        (int32)(InetAton("127.0.0.1")),
			Port:        8888,
			ServiceName: "test",
		},
		Name:        name,
		Id:          UInt64ToBytes(span.SpanID()),
		ParentId:    UInt64ToBytes(span.ParentID()),
		Annotations: BuildZipkinAnnotations(annotations),
		Debug:       false,
	}

	assert.Equal(t, thriftSpan, expectedSpan)
}

func TestInetAton(t *testing.T) {
	assert.Equal(t, InetAton("1.0.0.1"), (uint32)(16777217))
}

func TestUInt64ToBytes(t *testing.T) {
	assert.Equal(t, UInt64ToBytes(54613478251749257), []byte("\x00\xc2\x06\xabK$\xdf\x89"))
}

func TestBase64Encode(t *testing.T) {
	assert.Equal(t, Base64Encode(12711515087145684), "AC0pDj1TitQ=")
}

func RandomAnnotations() []tchannel.Annotation {
	anns := make([]tchannel.Annotation, 4)
	anns[0] = tchannel.Annotation{
		Key:       tchannel.AnnotationKeyClientReceive,
		Timestamp: time.Now(),
	}
	anns[1] = tchannel.Annotation{
		Key:       tchannel.AnnotationKeyClientSend,
		Timestamp: time.Now(),
	}
	anns[2] = tchannel.Annotation{
		Key:       tchannel.AnnotationKeyServerReceive,
		Timestamp: time.Now(),
	}
	anns[3] = tchannel.Annotation{
		Key:       tchannel.AnnotationKeyServerSend,
		Timestamp: time.Now(),
	}

	return anns
}
