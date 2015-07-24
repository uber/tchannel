package tchannel_test

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

import (
	"fmt"
	"io"
	"io/ioutil"
	"testing"
	"time"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/testutils"
	"golang.org/x/net/context"
)

func makeRepeatedBytes(n byte) []byte {
	data := make([]byte, int(n))
	for i := byte(0); i < n; i++ {
		data[i] = n
	}
	return data
}

// streamPartialHandler returns a streaming handler that has the following contract:
// read a byte, write N bytes where N = the byte that was read.
// The results are be written as soon as the byte is read.
func streamPartialHandler(t *testing.T) HandlerFunc {
	return func(ctx context.Context, call *InboundCall) {
		response := call.Response()
		onError := func(err error) {
			t.Errorf("Handler error: %v", err)
			response.SendSystemError(fmt.Errorf("failed to read arg2"))
		}

		var arg2 []byte
		if err := NewArgReader(call.Arg2Reader()).Read(&arg2); err != nil {
			onError(fmt.Errorf("failed to read arg2"))
			return
		}

		if err := NewArgWriter(response.Arg2Writer()).Write(nil); err != nil {
			onError(fmt.Errorf(""))
			return
		}

		argReader, err := call.Arg3Reader()
		if err != nil {
			onError(fmt.Errorf("failed to read arg3"))
			return
		}

		argWriter, err := response.Arg3Writer()
		if err != nil {
			onError(fmt.Errorf("arg3 writer failed"))
			return
		}

		// Flush arg3 which will force a frame with just arg2 to be sent.
		// The test reads arg2 before arg3 has been sent.
		if err := argWriter.Flush(); err != nil {
			onError(fmt.Errorf("arg3 flush failed"))
			return
		}

		arg3 := make([]byte, 1)
		for {
			n, err := argReader.Read(arg3)
			if err == io.EOF {
				break
			}
			if n == 0 && err == nil {
				err = fmt.Errorf("read 0 bytes")
			}
			if err != nil {
				onError(fmt.Errorf("arg3 Read failed: %v", err))
				return
			}

			// Write the number of bytes as specified by arg3[0]
			if _, err := argWriter.Write(makeRepeatedBytes(arg3[0])); err != nil {
				onError(fmt.Errorf("argWriter Write failed: %v", err))
				return
			}
			if err := argWriter.Flush(); err != nil {
				onError(fmt.Errorf("argWriter flush failed: %v", err))
				return
			}
		}

		if err := argReader.Close(); err != nil {
			onError(fmt.Errorf("argReader Close failed: %v", err))
			return
		}

		if err := argWriter.Close(); err != nil {
			onError(fmt.Errorf("arg3writer Close failed: %v", err))
			return
		}
	}
}

func TestStreamPartialArg(t *testing.T) {
	defer testutils.SetTimeout(t, 2*time.Second)()
	ctx, cancel := NewContext(time.Second)
	defer cancel()

	require.NoError(t, testutils.WithServer(nil, func(ch *Channel, hostPort string) {
		ch.Register(streamPartialHandler(t), "echoStream")

		call, err := ch.BeginCall(ctx, hostPort, ch.PeerInfo().ServiceName, "echoStream", nil)
		require.NoError(t, err, "BeginCall failed")
		require.Nil(t, NewArgWriter(call.Arg2Writer()).Write(nil))

		argWriter, err := call.Arg3Writer()
		require.NoError(t, err, "Arg3Writer failed")

		// Flush arg3 to force the call to start without any arg3.
		require.NoError(t, argWriter.Flush(), "Arg3Writer flush failed")

		// Write out to the stream, and expect to get data
		response := call.Response()

		var arg2 []byte
		require.NoError(t, NewArgReader(response.Arg2Reader()).Read(&arg2), "Arg2Reader failed")
		require.False(t, response.ApplicationError(), "call failed")

		argReader, err := response.Arg3Reader()
		require.NoError(t, err, "Arg3Reader failed")

		verifyBytes := func(n byte) {
			_, err := argWriter.Write([]byte{n})
			require.NoError(t, err, "arg3 write failed")
			require.NoError(t, argWriter.Flush(), "arg3 flush failed")

			arg3 := make([]byte, int(n))
			_, err = io.ReadFull(argReader, arg3)
			require.NoError(t, err, "arg3 read failed")

			assert.Equal(t, makeRepeatedBytes(n), arg3, "arg3 result mismatch")
		}

		verifyBytes(0)
		verifyBytes(5)
		verifyBytes(100)
		verifyBytes(1)

		require.NoError(t, argWriter.Close(), "arg3 close failed")

		// Once closed, we expect the reader to return EOF
		n, err := io.Copy(ioutil.Discard, argReader)
		assert.Equal(t, int64(0), n, "arg2 reader expected to EOF after arg3 writer is closed")
	}))
}
