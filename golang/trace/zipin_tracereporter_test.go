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
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
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
		ServiceName: "test",
		Name:        "test",
	}
	span := *tchannel.NewRootSpan()
	annotations := RandomAnnotations()
	thriftSpan := buildZipkinSpan(span, annotations, nil, endpoint)

	expectedSpan := &gen.Span{
		TraceId: uint64ToBytes(span.TraceID()),
		Host: &gen.Endpoint{
			Ipv4:        (int32)(inetAton("127.0.0.1")),
			Port:        8888,
			ServiceName: "test",
		},
		Name:        "test",
		Id:          uint64ToBytes(span.SpanID()),
		ParentId:    uint64ToBytes(span.ParentID()),
		Annotations: buildZipkinAnnotations(annotations),
		Debug:       false,
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

func RandomAnnotations() []tchannel.Annotation {
	baseTime := time.Date(2015, 1, 2, 3, 4, 5, 6, time.UTC)
	return []tchannel.Annotation{
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
			ServiceName: "test",
			Name:        "test",
		}
		span := *tchannel.NewRootSpan()
		annotations := RandomAnnotations()
		thriftSpan := buildZipkinSpan(span, annotations, nil, endpoint)
		thriftSpan.BinaryAnnotations = []*gen.BinaryAnnotation{}
		ret := &gen.Response{Ok: true}

		args.s.On("Submit", ctxArg(), thriftSpan).Return(ret, nil)
		err := args.c.Report(span, annotations, nil, endpoint)
		assert.NoError(t, err)
	})
}

func withSetup(t *testing.T, f func(ctx thrift.Context, args testArgs)) {
	args := testArgs{
		s: new(mocks.TChanTCollector),
	}

	ctx, cancel := thrift.NewContext(time.Second * 10)
	defer cancel()

	// Start server
	tchan, listener, err := setupServer(args.s)
	require.NoError(t, err)
	defer tchan.Close()

	// Get client1
	args.c, err = getClient(listener.Addr().String())
	require.NoError(t, err)

	f(ctx, args)

	args.s.AssertExpectations(t)
}

func setupServer(h *mocks.TChanTCollector) (*tchannel.Channel, net.Listener, error) {
	tchan, err := tchannel.NewChannel(tcollectorServiceName, &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, nil, err
	}

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return nil, nil, err
	}

	server := thrift.NewServer(tchan)
	server.Register(gen.NewTChanTCollectorServer(h))

	tchan.Serve(listener)
	return tchan, listener, nil
}

func getClient(dst string) (tchannel.TraceReporter, error) {
	tchan, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, err
	}

	tchan.Peers().Add(dst)
	return NewZipkinTraceReporter(tchan), nil
}
