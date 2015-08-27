package trace

import (
	"net"
	"reflect"
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

	expectedSpan := gen.Span{
		TraceId: UInt64ToBytes(span.TraceID()),
		Host: &gen.Endpoint{
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
	reflect.DeepEqual(thriftSpan, expectedSpan)
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

type testArgs struct {
	s *mocks.TChanTCollector
	c gen.TChanTCollector // ?
}

func ctxArg() mock.AnythingOfTypeArgument {
	return mock.AnythingOfType("*tchannel.headerCtx")
}

func TestSubmit(t *testing.T) {
	withSetup(t, func(ctx thrift.Context, args testArgs) {
		host := &tchannel.Endpoint{
			Ipv4:        "127.0.0.1",
			Port:        8888,
			ServiceName: "test",
		}
		span := *tchannel.NewRootSpan()
		name := "test"
		annotations := RandomAnnotations()
		thriftSpan := BuildZipkinSpan(span, annotations, nil, name, host)
		thriftSpan.BinaryAnnotations = []*gen.BinaryAnnotation{}
		ret := &gen.Response{Ok: true}
		args.s.On("Submit", ctxArg(), thriftSpan).Return(ret, nil)
		got, err := args.c.Submit(ctx, thriftSpan)
		require.NoError(t, err)
		assert.Equal(t, ret, got)
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
	tchan, err := tchannel.NewChannel("service", nil)
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

func getClient(dst string) (gen.TChanTCollector, error) {
	tchan, err := tchannel.NewChannel("client", &tchannel.ChannelOptions{
		Logger: tchannel.SimpleLogger,
	})
	if err != nil {
		return nil, err
	}

	tchan.Peers().Add(dst)
	client := thrift.NewClient(tchan, "service", nil)

	tcollectorClient := gen.NewTChanTCollectorClient(client)
	return tcollectorClient, nil
}
