package tchannel

import (
	"code.google.com/p/go.net/context"
	"github.com/op/go-logging"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	var inArg2 BytesInput
	if err := call.ReadArg2(&inArg2); err != nil {
		testLog.Error("could not start arg2: %v", err)
		return
	}

	testLog.Info("Arg2: %s", inArg2)

	var inArg3 BytesInput
	if err := call.ReadArg3(&inArg3); err != nil {
		testLog.Error("could not start arg3: %v", err)
		return
	}

	testLog.Info("Arg3: %s", inArg3)

	if err := call.Response().WriteArg2(BytesOutput(inArg2)); err != nil {
		testLog.Error("could not write arg2: %v", err)
		return
	}

	if err := call.Response().WriteArg3(BytesOutput(inArg3)); err != nil {
		testLog.Error("could not write arg3: %v", err)
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

	require.Nil(t, call.WriteArg2(BytesOutput("Hello Header")))
	require.Nil(t, call.WriteArg3(BytesOutput("Body Sent")))

	var respArg2 BytesInput
	require.Nil(t, call.Response().ReadArg2(&respArg2))
	assert.Equal(t, []byte("Hello Header"), []byte(respArg2))

	var respArg3 BytesInput
	require.Nil(t, call.Response().ReadArg3(&respArg3))
	assert.Equal(t, []byte("Body Sent"), []byte(respArg3))
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

func TestFragmentation(t *testing.T) {
	ch, err := NewChannel(":8072", nil)
	require.Nil(t, err)

	ch.Register(HandleFunc(echo), "TestService", "echo")
	go ch.ListenAndHandle()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	arg2 := make([]byte, MaxFramePayloadSize*2)
	for i := 0; i < len(arg2); i++ {
		arg2[i] = byte(i&0x0F) + 50
	}

	arg3 := make([]byte, MaxFramePayloadSize*3)
	for i := 0; i < len(arg3); i++ {
		arg3[i] = byte(i&0xF0) + 100
	}

	respArg2, respArg3, err := sendRecv(ctx, ch, "localhost:8072", "TestService", "echo", arg2, arg3)
	require.Nil(t, err)
	assert.Equal(t, arg2, respArg2)
	assert.Equal(t, arg3, respArg3)
}

func sendRecv(ctx context.Context, ch *TChannel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, error) {

	call, err := ch.BeginCall(ctx, hostPort, serviceName, operation)
	if err != nil {
		return nil, nil, err
	}

	if err := call.WriteArg2(BytesOutput(arg2)); err != nil {
		return nil, nil, err
	}

	if err := call.WriteArg3(BytesOutput(arg3)); err != nil {
		return nil, nil, err
	}

	var respArg2 BytesInput
	if err := call.Response().ReadArg2(&respArg2); err != nil {
		return nil, nil, err
	}

	var respArg3 BytesInput
	if err := call.Response().ReadArg3(&respArg3); err != nil {
		return nil, nil, err
	}

	return []byte(respArg2), []byte(respArg3), nil
}
