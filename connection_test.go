package tchannel

import (
	"code.google.com/p/go.net/context"
	"github.com/op/go-logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"io"
	"io/ioutil"
	"net"
	"testing"
	"time"
)

var testLog = logging.MustGetLogger("test")

type CapturedCall struct {
	ServiceName string
	Operation   []byte
	Arg2        []byte
	Arg3        []byte
	Err         error
}

type CaptureHandler struct {
	Calls []*CapturedCall
}

func (h *CaptureHandler) Handle(ctx context.Context, serviceName string, operation []byte, call *InboundCall) {
	capture := &CapturedCall{
		ServiceName: serviceName,
		Operation:   operation,
	}

	testLog.Info("Starting operation %s", string(operation))
	h.Calls = append(h.Calls, capture)

	rarg2, err := call.ExpectArg2()
	if err != nil {
		testLog.Error("could not start arg2: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	arg2, err := ioutil.ReadAll(rarg2)
	if err != nil && err != io.EOF {
		testLog.Error("could not read arg2: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	testLog.Info("Arg2: %s", arg2)

	rarg3, err := call.ExpectArg3()
	if err != nil {
		testLog.Error("could not start arg3: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	arg3, err := ioutil.ReadAll(rarg3)
	if err != nil && err != io.EOF {
		testLog.Error("could not read arg3: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	testLog.Info("Arg3: %s", arg3)

	capture.Arg2 = arg2
	capture.Arg3 = arg3

	warg2, err := call.Response().BeginArg2()
	if err != nil {
		testLog.Error("coult not start writing arg2: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	if _, err := warg2.Write(arg2); err != nil {
		testLog.Error("could not write arg2: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	warg3, err := call.Response().BeginArg3()
	if err != nil {
		testLog.Error("could not start writing arg3: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	if _, err := warg3.Write(arg3); err != nil {
		testLog.Error("could not write arg3: %v", err)
		capture.Err = err
		call.Response().SendSystemError(err)
		return
	}

	if err := call.Response().Send(); err != nil {
		testLog.Error("could not send full response: %v", err)
		capture.Err = err
		return
	}
}

func testOutbound(t *testing.T) {
	ch, err := NewChannel(":8050", nil)
	require.Nil(t, err)

	out, err := net.Dial("tcp", "localhost:4040")
	require.Nil(t, err)

	conn, err := newOutboundConnection(ch, out, nil)
	require.Nil(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()
	if err := conn.sendInit(ctx); err != nil {
		require.Nil(t, err)
	}

}

func TestRoundTrip(t *testing.T) {
	var h CaptureHandler

	ch, err := NewChannel(":8050", nil)
	require.Nil(t, err)

	ch.Register(&h, "Capture", "ping")

	go ch.ListenAndHandle()

	out, err := net.Dial("tcp", "localhost:8050")
	require.Nil(t, err)

	conn, err := newOutboundConnection(ch, out, nil)
	require.Nil(t, err)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()
	if err := conn.sendInit(ctx); err != nil {
		require.Nil(t, err)
	}

	call, err := conn.BeginCall(ctx, "Capture")
	if err != nil {
		require.Nil(t, err)
	}

	w, err := call.BeginArg1()
	if err != nil {
		require.Nil(t, err)
	}

	if _, err := w.Write([]byte("ping")); err != nil {
		require.Nil(t, err)
	}

	w, err = call.BeginArg2()
	if err != nil {
		require.Nil(t, err)
	}

	if _, err := w.Write([]byte("Hello Header")); err != nil {
		require.Nil(t, err)
	}

	w, err = call.BeginArg3()
	if err != nil {
		require.Nil(t, err)
	}

	if _, err := w.Write([]byte("Body Sent")); err != nil {
		require.Nil(t, err)
	}

	resp, err := call.RoundTrip()
	if err != nil {
		require.Nil(t, err)
	}

	require.False(t, resp.ApplicationError())
	rarg2, err := resp.ExpectArg2()
	if err != nil {
		require.Nil(t, err)
	}

	arg2, err := ioutil.ReadAll(rarg2)
	if err != nil {
		require.Nil(t, err)
	}

	assert.Equal(t, []byte("Hello Header"), arg2)

	rarg3, err := resp.ExpectArg3()
	if err != nil {
		require.Nil(t, err)
	}

	arg3, err := ioutil.ReadAll(rarg3)
	if err != nil {
		require.Nil(t, err)
	}

	assert.Equal(t, []byte("Body Sent"), arg3)

	require.Nil(t, resp.Close())
}

/*
func TestBadRequest(t *testing.T) {
}

func TestServerBusy(t *testing.T) {
}

func TestUnexpectedSystemError(t *testing.T) {
}

func TestBadProtocolVersionFromInitiatingPeer(t *testing.T) {
}

func TestBadProtocolVersionFromReceivingPeer(t *testing.T) {
}

func TestHangupDuringInit(t *testing.T) {
}

func TestHangupDuringInboundCallRead(t *testing.T) {
}

func TestCancelDuringInboundCallRead(t *testing.T) {
}

*/
