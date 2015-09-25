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

package trace

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/testutils"
	"github.com/uber/tchannel/golang/thrift"
	gen "github.com/uber/tchannel/golang/trace/thrift/gen-go/tcollector"
	"github.com/uber/tchannel/golang/trace/thrift/mocks"
)

func TestZipkinTraceReporterFactory(t *testing.T) {
	_, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger:               tchannel.SimpleLogger,
		TraceReporterFactory: ZipkinTraceReporterFactory,
	})

	assert.NoError(t, err)
}

func TestBuildZipkinSpan(t *testing.T) {
	endpoint := tchannel.TargetEndpoint{
		HostPort:    "127.0.0.1:8888",
		ServiceName: "testServer",
		Operation:   "test",
	}
	span := *tchannel.NewRootSpan()
	_, annotations := RandomAnnotations()
	binaryAnnotations := []tchannel.BinaryAnnotation{{Key: "cn", Value: "string"}}
	thriftSpan := buildZipkinSpan(span, annotations, binaryAnnotations, endpoint)

	expectedSpan := &gen.Span{
		TraceId: uint64ToBytes(span.TraceID()),
		Host: &gen.Endpoint{
			Ipv4:        (int32)(inetAton("127.0.0.1")),
			Port:        8888,
			ServiceName: "testServer",
		},
		Name:              "test",
		Id:                uint64ToBytes(span.SpanID()),
		ParentId:          uint64ToBytes(span.ParentID()),
		Annotations:       buildZipkinAnnotations(annotations),
		BinaryAnnotations: buildBinaryAnnotations(binaryAnnotations),
		Debug:             false,
	}

	assert.Equal(t, thriftSpan, expectedSpan, "Span mismatch")
}

func TestInetAton(t *testing.T) {
	assert.Equal(t, inetAton("1.2.3.4"), uint32(16909060))
}

func TestUInt64ToBytes(t *testing.T) {
	assert.Equal(t, uint64ToBytes(54613478251749257), []byte("\x00\xc2\x06\xabK$\xdf\x89"))
}

func TestBase64Encode(t *testing.T) {
	assert.Equal(t, base64Encode(12711515087145684), "AC0pDj1TitQ=")
}

func TestBuildZipkinAnnotations(t *testing.T) {
	baseTime, testAnnotations := RandomAnnotations()
	baseTimeMillis := float64(1420167845000)
	testExpected := []*gen.Annotation{
		{
			Timestamp: baseTimeMillis + 1000,
			Value:     "cr",
		},
		{
			Timestamp: baseTimeMillis + 2000.0,
			Value:     "cs",
		},
		{
			Timestamp: baseTimeMillis + 3000,
			Value:     "sr",
		},
		{
			Timestamp: baseTimeMillis + 4000,
			Value:     "ss",
		},
	}

	makeTCAnnotations := func(ts time.Time) []tchannel.Annotation {
		return []tchannel.Annotation{{
			Key:       tchannel.AnnotationKeyClientReceive,
			Timestamp: ts,
		}}
	}
	makeGenAnnotations := func(ts float64) []*gen.Annotation {
		return []*gen.Annotation{{
			Value:     "cr",
			Timestamp: ts,
		}}
	}

	tests := []struct {
		annotations []tchannel.Annotation
		expected    []*gen.Annotation
	}{
		{
			annotations: nil,
			expected:    []*gen.Annotation{},
		},
		{
			annotations: makeTCAnnotations(baseTime.Add(time.Nanosecond)),
			expected:    makeGenAnnotations(baseTimeMillis),
		},
		{
			annotations: makeTCAnnotations(baseTime.Add(time.Microsecond)),
			expected:    makeGenAnnotations(baseTimeMillis),
		},
		{
			annotations: makeTCAnnotations(baseTime.Add(time.Millisecond)),
			expected:    makeGenAnnotations(baseTimeMillis + 1),
		},
		{
			annotations: testAnnotations,
			expected:    testExpected,
		},
	}

	for _, tt := range tests {
		got := buildZipkinAnnotations(tt.annotations)
		assert.Equal(t, tt.expected, got, "result spans mismatch")
	}
}

func RandomAnnotations() (time.Time, []tchannel.Annotation) {
	baseTime := time.Date(2015, 1, 2, 3, 4, 5, 6, time.UTC)
	return baseTime, []tchannel.Annotation{
		{
			Key:       tchannel.AnnotationKeyClientReceive,
			Timestamp: baseTime.Add(time.Second),
		},
		{
			Key:       tchannel.AnnotationKeyClientSend,
			Timestamp: baseTime.Add(2 * time.Second),
		},
		{
			Key:       tchannel.AnnotationKeyServerReceive,
			Timestamp: baseTime.Add(3 * time.Second),
		},
		{
			Key:       tchannel.AnnotationKeyServerSend,
			Timestamp: baseTime.Add(4 * time.Second),
		},
	}
}

type testArgs struct {
	s *mocks.TChanTCollector
	c tchannel.TraceReporter
}

func ctxArg() mock.AnythingOfTypeArgument {
	return mock.AnythingOfType("*tchannel.headerCtx")
}

func TestSubmit(t *testing.T) {
	withSetup(t, func(ctx thrift.Context, args testArgs) {
		endpoint := tchannel.TargetEndpoint{
			HostPort:    "127.0.0.1:8888",
			ServiceName: "testServer",
			Operation:   "test",
		}
		span := *tchannel.NewRootSpan()
		_, annotations := RandomAnnotations()
		thriftSpan := buildZipkinSpan(span, annotations, nil, endpoint)
		thriftSpan.BinaryAnnotations = []*gen.BinaryAnnotation{}
		ret := &gen.Response{Ok: true}

		called := make(chan struct{})
		args.s.On("Submit", ctxArg(), thriftSpan).Return(ret, nil).Run(func(_ mock.Arguments) {
			close(called)
		})
		args.c.Report(span, annotations, nil, endpoint)

		// wait for the server's Submit to get called
		select {
		case <-time.After(time.Second):
			t.Fatal("Submit not called")
		case <-called:
		}
	})
}

func withSetup(t *testing.T, f func(ctx thrift.Context, args testArgs)) {
	args := testArgs{
		s: new(mocks.TChanTCollector),
	}

	ctx, cancel := thrift.NewContext(time.Second * 10)
	defer cancel()

	// Start server
	tchan, err := setupServer(args.s)
	require.NoError(t, err)
	defer tchan.Close()

	// Get client1
	args.c, err = getClient(tchan.PeerInfo().HostPort)
	require.NoError(t, err)

	f(ctx, args)

	args.s.AssertExpectations(t)
}

func setupServer(h *mocks.TChanTCollector) (*tchannel.Channel, error) {
	tchan, err := testutils.NewServer(&testutils.ChannelOpts{
		ServiceName: tcollectorServiceName,
	})
	if err != nil {
		return nil, err
	}

	server := thrift.NewServer(tchan)
	server.Register(gen.NewTChanTCollectorServer(h))
	return tchan, nil
}

func getClient(dst string) (tchannel.TraceReporter, error) {
	tchan, err := testutils.NewClient(nil)
	if err != nil {
		return nil, err
	}

	tchan.Peers().Add(dst)
	return NewZipkinTraceReporter(tchan), nil
}

func BenchmarkBuildThrift(b *testing.B) {
	endpoint := tchannel.TargetEndpoint{
		HostPort:    "127.0.0.1:8888",
		ServiceName: "testServer",
		Operation:   "test",
	}
	span := *tchannel.NewRootSpan()
	_, annotations := RandomAnnotations()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buildZipkinSpan(span, annotations, nil, endpoint)
	}
}

func TestBuildBinaryAnnotation(t *testing.T) {
	s := "testString"
	ii64 := int64(5)
	ii32 := int32(5)
	ii16 := int16(5)
	i := 5
	b := false
	f32 := float32(5.0)
	f64 := float64(5.0)
	bs := []byte{4, 3, 2}

	tests := []struct {
		banns    tchannel.BinaryAnnotation
		expected *gen.BinaryAnnotation
	}{
		{
			tchannel.BinaryAnnotation{Key: "string", Value: s},
			&gen.BinaryAnnotation{Key: "string", StringValue: &s, AnnotationType: gen.AnnotationType_STRING},
		},
		{
			tchannel.BinaryAnnotation{Key: "int", Value: i},
			&gen.BinaryAnnotation{Key: "int", IntValue: &ii64, AnnotationType: gen.AnnotationType_I32},
		},
		{
			tchannel.BinaryAnnotation{Key: "int16", Value: ii16},
			&gen.BinaryAnnotation{Key: "int16", IntValue: &ii64, AnnotationType: gen.AnnotationType_I16},
		},
		{
			tchannel.BinaryAnnotation{Key: "int32", Value: ii32},
			&gen.BinaryAnnotation{Key: "int32", IntValue: &ii64, AnnotationType: gen.AnnotationType_I32},
		},
		{
			tchannel.BinaryAnnotation{Key: "int64", Value: ii64},
			&gen.BinaryAnnotation{Key: "int64", IntValue: &ii64, AnnotationType: gen.AnnotationType_I64},
		},
		{
			tchannel.BinaryAnnotation{Key: "bool", Value: b},
			&gen.BinaryAnnotation{Key: "bool", BoolValue: &b, AnnotationType: gen.AnnotationType_BOOL},
		},
		{
			tchannel.BinaryAnnotation{Key: "float32", Value: f32},
			&gen.BinaryAnnotation{Key: "float32", DoubleValue: &f64, AnnotationType: gen.AnnotationType_DOUBLE},
		},
		{
			tchannel.BinaryAnnotation{Key: "float64", Value: f64},
			&gen.BinaryAnnotation{Key: "float64", DoubleValue: &f64, AnnotationType: gen.AnnotationType_DOUBLE},
		},
		{
			tchannel.BinaryAnnotation{Key: "bytes", Value: bs},
			&gen.BinaryAnnotation{Key: "bytes", BytesValue: bs, AnnotationType: gen.AnnotationType_BYTES},
		},
	}

	for _, tt := range tests {
		result := buildBinaryAnnotation(tt.banns)
		assert.Equal(t, tt.expected, result, "BinaryAnnotation is mismatched.")
	}

}
