package tchannel

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/typed"
	"testing"
)

func TestFraming(t *testing.T) {
	fh := FrameHeader{
		Size: uint16(0xFF34),
		Type: MessageTypeCallReq,
		Id:   0xDEADBEEF,
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
