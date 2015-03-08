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

func serverBusy(ctx context.Context, call *InboundCall) {
	call.Response().SendSystemError(ErrServerBusy)
}

func echo(ctx context.Context, call *InboundCall) {
	rarg2, err := call.ExpectArg2()
	if err != nil {
		testLog.Error("could not start arg2: %v", err)
		return
	}

	arg2, err := ioutil.ReadAll(rarg2)
	if err != nil && err != io.EOF {
		testLog.Error("could not read arg2: %v", err)
		return
	}

	testLog.Info("Arg2: %s", arg2)

	rarg3, err := call.ExpectArg3()
	if err != nil {
		testLog.Error("could not start arg3: %v", err)
		return
	}

	arg3, err := ioutil.ReadAll(rarg3)
	if err != nil && err != io.EOF {
		testLog.Error("could not read arg3: %v", err)
		return
	}

	testLog.Info("Arg3: %s", arg3)

	warg2, err := call.Response().BeginArg2()
	if err != nil {
		testLog.Error("coult not start writing arg2: %v", err)
		return
	}

	if _, err := warg2.Write(arg2); err != nil {
		testLog.Error("could not write arg2: %v", err)
		return
	}

	warg3, err := call.Response().BeginArg3()
	if err != nil {
		testLog.Error("could not start writing arg3: %v", err)
		return
	}

	if _, err := warg3.Write(arg3); err != nil {
		testLog.Error("could not write arg3: %v", err)
		return
	}

	if err := call.Response().Send(); err != nil {
		testLog.Error("could not send full response: %v", err)
		return
	}
}

func TestRoundTrip(t *testing.T) {
	ch, err := NewChannel(":8050", nil)
	require.Nil(t, err)

	ch.Register(HandleFunc(echo), "Capture", "ping")

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

func TestBadRequest(t *testing.T) {
	ch, err := NewChannel(":8051", nil)
	require.Nil(t, err)
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, "localhost:8051", "Nowhere", "Noone", []byte("Headers"), []byte("Body"))
	require.NotNil(t, err)
	assert.Equal(t, ErrorCodeBadRequest, GetSystemErrorCode(err))
}

func TestServerBusy(t *testing.T) {
	ch, err := NewChannel(":8070", nil)
	require.Nil(t, err)

	ch.Register(HandleFunc(serverBusy), "TestService", "busy")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, "localhost:8070", "TestService", "busy", []byte("Arg2"), []byte("Arg3"))
	require.NotNil(t, err)
	assert.Equal(t, ErrorCodeBusy, GetSystemErrorCode(err))
}

func sendRecv(ctx context.Context, ch *TChannel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, error) {

	netConn, err := net.Dial("tcp", hostPort)
	if err != nil {
		return nil, nil, err
	}

	conn, err := newOutboundConnection(ch, netConn, nil)
	if err != nil {
		return nil, nil, err
	}

	if err := conn.sendInit(ctx); err != nil {
		return nil, nil, err
	}

	call, err := conn.BeginCall(ctx, serviceName)
	if err != nil {
		return nil, nil, err
	}

	w, err := call.BeginArg1()
	if err != nil {
		return nil, nil, err
	}

	if _, err := w.Write([]byte(operation)); err != nil {
		return nil, nil, err
	}

	w, err = call.BeginArg2()
	if err != nil {
		return nil, nil, err
	}

	if _, err := w.Write(arg2); err != nil {
		return nil, nil, err
	}

	w, err = call.BeginArg3()
	if err != nil {
		return nil, nil, err
	}

	if _, err := w.Write([]byte("Body Sent")); err != nil {
		return nil, nil, err
	}

	resp, err := call.RoundTrip()
	if err != nil {
		return nil, nil, err
	}

	rarg2, err := resp.ExpectArg2()
	if err != nil {
		return nil, nil, err
	}

	respArg2, err := ioutil.ReadAll(rarg2)
	if err != nil {
		return nil, nil, err
	}

	rarg3, err := resp.ExpectArg3()
	if err != nil {
		return nil, nil, err
	}

	respArg3, err := ioutil.ReadAll(rarg3)
	if err != nil {
		return nil, nil, err
	}

	if err := resp.Close(); err != nil {
		return nil, nil, err
	}

	return respArg2, respArg3, nil
}
