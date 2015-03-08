package tchannel

import (
	"code.google.com/p/go.net/context"
	"github.com/op/go-logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"io"
	"io/ioutil"
	"testing"
	"time"
)

var testLog = logging.MustGetLogger("test")

func serverBusy(ctx context.Context, call *InboundCall) {
	call.Response().SendSystemError(ErrServerBusy)
}

func timeout(ctx context.Context, call *InboundCall) {
	deadline, _ := ctx.Deadline()
	time.Sleep(deadline.Add(time.Second * 1).Sub(time.Now()))
	echo(ctx, call)
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

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	call, err := ch.BeginCall(ctx, "localhost:8050", "Capture", "ping")
	require.Nil(t, err)

	w, err := call.BeginArg2()
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

func TestTimeout(t *testing.T) {
	ch, err := NewChannel(":8071", nil)
	require.Nil(t, err)

	ch.Register(HandleFunc(timeout), "TestService", "timeout")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	_, _, err = sendRecv(ctx, ch, "localhost:8071", "TestService", "timeout", []byte("Arg2"), []byte("Arg3"))

	// TODO(mmihic): Maybe translate this into ErrTimeout (or vice versa)?
	assert.Equal(t, context.DeadlineExceeded, err)
}

func sendRecv(ctx context.Context, ch *TChannel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, error) {

	call, err := ch.BeginCall(ctx, hostPort, serviceName, operation)
	if err != nil {
		return nil, nil, err
	}

	w, err := call.BeginArg2()
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
