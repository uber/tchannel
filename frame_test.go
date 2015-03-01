package tchannel

import (
	"bytes"
	"code.uber.internal/infra/mmihic/tchannel-go/typed"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestFraming(t *testing.T) {
	s := []byte("Hello there smalldog")

	fh := FrameHeader{
		Size: uint16(len(s)),
		Type: MessageTypeCallReq,
	}

	w := typed.NewWriteBufferWithSize(1024)
	w.WriteBytes(s)

	var b bytes.Buffer
	fw := NewFrameWriter(&b)
	err := fw.WriteFrame(fh, w)
	require.Nil(t, err, "could not write frame")

	fr := NewFrameReader(bytes.NewReader(b.Bytes()))

	var fh2 FrameHeader
	r := typed.NewReadBufferWithSize(1024)
	err = fr.ReadFrame(&fh2, r)
	require.Nil(t, err, "could not read frame")

	assert.Equal(t, fh, fh2, "frames do not match")

	s2, err := r.ReadBytes(len(s))
	require.Nil(t, err)
	assert.Equal(t, s, s2)
}
