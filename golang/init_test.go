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
	tests := []struct {
		name          string
		initMsg       message
		expectedError errorMessage
	}{
		{
			name: "bad version",
			initMsg: &initReq{initMessage{id: 1, Version: 0x1, initParams: initParams{
				InitParamHostPort:    "0.0.0.0:0",
				InitParamProcessName: "test",
			}}},
			expectedError: errorMessage{
				id:      invalidMessageID,
				errCode: ErrCodeProtocol,
			},
		},
		{
			name: "missing InitParamHostPort",
			initMsg: &initReq{initMessage{id: 1, Version: CurrentProtocolVersion, initParams: initParams{
				InitParamProcessName: "test",
			}}},
			expectedError: errorMessage{
				id:      invalidMessageID,
				errCode: ErrCodeProtocol,
			},
		},
		{
			name: "missing InitParamProcessName",
			initMsg: &initReq{initMessage{id: 1, Version: CurrentProtocolVersion, initParams: initParams{
				InitParamHostPort: "0.0.0.0:0",
			}}},
			expectedError: errorMessage{
				id:      invalidMessageID,
				errCode: ErrCodeProtocol,
			},
		},
	}

	for _, tt := range tests {
		ch, err := NewChannel("test", nil)
		require.NoError(t, err)
		defer ch.Close()
		require.NoError(t, ch.ListenAndServe(":0"))
		hostPort := ch.PeerInfo().HostPort

		conn, err := net.Dial("tcp", hostPort)
		require.NoError(t, err)
		conn.SetReadDeadline(time.Now().Add(time.Second))

		require.NoError(t, writeMessage(conn, tt.initMsg))

		f, err := readFrame(conn)
		require.NoError(t, err)
		assert.Equal(t, messageTypeError, f.Header.messageType)
		var errMsg errorMessage
		require.NoError(t, f.read(&errMsg))
		assert.Equal(t, tt.expectedError.ID(), errMsg.ID(), "test %v got bad ID", tt.name)
		assert.Equal(t, tt.expectedError.errCode, errMsg.errCode, "test %v got bad code", tt.name)
	}
}
