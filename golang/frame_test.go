package tchannel

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
	"bytes"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/typed"
)

func TestFraming(t *testing.T) {
	fh := FrameHeader{
		size:        uint16(0xFF34),
		messageType: messageTypeCallReq,
		ID:          0xDEADBEEF,
	}

	wbuf := typed.NewWriteBufferWithSize(1024)
	require.Nil(t, fh.write(wbuf))

	var b bytes.Buffer
	if _, err := wbuf.FlushTo(&b); err != nil {
		require.Nil(t, err)
	}

	rbuf := typed.NewReadBuffer(b.Bytes())

	var fh2 FrameHeader
	require.Nil(t, fh2.read(rbuf))

	assert.Equal(t, fh, fh2)
}

func TestEmptyPayload(t *testing.T) {
	f := NewFrame(MaxFramePayloadSize)
	m := &pingRes{id: 1}
	require.NoError(t, f.write(m))

	// Write out the frame.
	buf := &bytes.Buffer{}
	require.NoError(t, f.WriteTo(buf))
	assert.Equal(t, FrameHeaderSize, buf.Len())

	// Read the frame from the buffer.
	// net.Conn returns io.EOF if you try to read 0 bytes at the end.
	// This is also simulated by the LimitedReader so we use that here.
	require.NoError(t, f.ReadFrom(&io.LimitedReader{R: buf, N: FrameHeaderSize}))
}
