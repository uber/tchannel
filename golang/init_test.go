package tchannel

import (
	"io"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeMessage(w io.Writer, msg message) error {
	f := NewFrame(MaxFramePayloadSize)
	if err := f.write(msg); err != nil {
		return err
	}
	return f.WriteTo(w)
}

func readFrame(r io.Reader) (*Frame, error) {
	f := NewFrame(MaxFramePayloadSize)
	return f, f.ReadFrom(r)
}

func TestUnexpectedInitReq(t *testing.T) {
	ch, err := NewChannel("test", nil)
	require.NoError(t, err)
	require.NoError(t, ch.ListenAndServe(":0"))
	hostPort := ch.PeerInfo().HostPort

	conn, err := net.Dial("tcp", hostPort)
	require.NoError(t, err)
	conn.SetReadDeadline(time.Now().Add(time.Second))

	msg := &initReq{initMessage{id: 1, Version: 0x1, initParams: initParams{
		InitParamHostPort:    "0.0.0.0:0",
		InitParamProcessName: "test",
	}}}
	require.NoError(t, writeMessage(conn, msg))

	f, err := readFrame(conn)
	require.NoError(t, err)
	assert.Equal(t, messageTypeError, f.Header.messageType)
	var errMsg errorMessage
	require.NoError(t, f.read(&errMsg))
	assert.Equal(t, invalidMessageID, errMsg.ID())
	assert.Equal(t, ErrCodeProtocol, errMsg.errCode)
}
