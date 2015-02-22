package tchannel

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestFraming(t *testing.T) {
	payload := []byte("Hello there smalldog")

	f := &Frame{
		Header: FrameHeader{
			Size:  uint32(len(payload)),
			Type:  MessageTypeCallReq,
			Flags: 0x34,
		},
		Payload: payload,
	}

	var b bytes.Buffer
	fw := NewFrameWriter(&b)
	err := fw.WriteFrame(f)
	require.Nil(t, err, "could not write frame")

	fr := NewFrameReader(bytes.NewReader(b.Bytes()))
	f2, err := fr.ReadFrame()
	require.Nil(t, err, "could not read frame")

	assert.Equal(t, f, &f2, "frames do not match")
}
