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
	return f.WriteOut(w)
}

func readFrame(r io.Reader) (*Frame, error) {
	f := NewFrame(MaxFramePayloadSize)
	return f, f.ReadIn(r)
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
				id:      1,
				errCode: ErrCodeProtocol,
			},
		},
		{
			name: "missing InitParamHostPort",
			initMsg: &initReq{initMessage{id: 2, Version: CurrentProtocolVersion, initParams: initParams{
				InitParamProcessName: "test",
			}}},
			expectedError: errorMessage{
				id:      2,
				errCode: ErrCodeProtocol,
			},
		},
		{
			name: "missing InitParamProcessName",
			initMsg: &initReq{initMessage{id: 3, Version: CurrentProtocolVersion, initParams: initParams{
				InitParamHostPort: "0.0.0.0:0",
			}}},
			expectedError: errorMessage{
				id:      3,
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

		if !assert.NoError(t, writeMessage(conn, tt.initMsg), "write to conn failed") {
			continue
		}

		f, err := readFrame(conn)
		if !assert.NoError(t, err, "read frame failed") {
			continue
		}
		assert.Equal(t, messageTypeError, f.Header.messageType)
		var errMsg errorMessage
		if !assert.NoError(t, f.read(&errMsg), "parse frame to errorMessage") {
			continue
		}
		assert.Equal(t, tt.expectedError.ID(), f.Header.ID, "test %v got bad ID", tt.name)
		assert.Equal(t, tt.expectedError.errCode, errMsg.errCode, "test %v got bad code", tt.name)
		assert.NoError(t, conn.Close(), "closing connection failed")
	}
}

// TestHandleInitRes ensures that a Connection is ready to handle messages immediately
// after receiving an InitRes.
func TestHandleInitRes(t *testing.T) {
	l, err := net.Listen("tcp", ":0")
	require.NoError(t, err, "net.Listen failed")
	listenerComplete := make(chan struct{})

	go func() {
		defer func() { listenerComplete <- struct{}{} }()
		conn, err := l.Accept()
		require.NoError(t, err, "l.Accept failed")
		defer conn.Close()

		f, err := readFrame(conn)
		require.NoError(t, err, "readFrame failed")
		assert.Equal(t, messageTypeInitReq, f.Header.messageType, "expected initReq message")

		var msg initReq
		require.NoError(t, f.read(&msg), "read frame into initMsg failed")
		initRes := initRes{msg.initMessage}
		initRes.initMessage.id = f.Header.ID
		require.NoError(t, writeMessage(conn, &initRes), "write initRes failed")
		require.NoError(t, writeMessage(conn, &pingReq{noBodyMsg{}, 10}), "write pingReq failed")

		f, err = readFrame(conn)
		require.NoError(t, err, "readFrame failed")
		assert.Equal(t, messageTypePingRes, f.Header.messageType, "expected pingRes message")
	}()

	ch, err := NewChannel("test-svc", nil)
	require.NoError(t, err, "NewClient failed")

	ctx, cancel := NewContext(time.Second)
	defer cancel()

	_, err = ch.Peers().GetOrAdd(l.Addr().String()).GetConnection(ctx)
	require.NoError(t, err, "GetConnection failed")

	<-listenerComplete
}
