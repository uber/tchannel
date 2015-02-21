package binio

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"io"
	"testing"
)

func TestReadWrite(t *testing.T) {
	s := "the small brown fix"
	bslice := []byte("jumped over the lazy dog")
	bslice2 := []byte("amadeus wolfcraft")

	var b bytes.Buffer
	w := NewWriter(&b)
	w.WriteUint64(0x0123456789ABCDEF)
	w.WriteUint32(0xABCDEF01)
	w.WriteUint16(0x2345)
	w.WriteByte(0xFF)
	w.WriteString(s)
	w.WriteBytes(bslice)
	w.WriteBytes(bslice2)
	w.Flush()

	r := NewReader(bytes.NewReader(b.Bytes()))
	{
		n, err := r.ReadUint64()
		assert.Nil(t, err, "could not read uint64")
		assert.Equal(t, n, uint64(0x0123456789ABCDEF), "mismatched uint64")
	}
	{
		n, err := r.ReadUint32()
		assert.Nil(t, err, "could not read uint32")
		assert.Equal(t, n, uint32(0xABCDEF01), "mismatched uint32")
	}
	{
		n, err := r.ReadUint16()
		assert.Nil(t, err, "Could not read uint16")
		assert.Equal(t, n, uint16(0x2345), "mismatched uint16")
	}
	{
		n, err := r.ReadByte()
		assert.Nil(t, err, "could not read byte")
		assert.Equal(t, n, byte(0xFF), "mismatched byte")
	}
	{

		rs, err := r.ReadString(len(s))
		assert.Nil(t, err, "could not read string")
		assert.Equal(t, rs, s, "mismatched string")
	}
	{
		rbslice, err := r.ReadBytes(len(bslice))
		assert.Nil(t, err, "could not read byte slice")
		assert.Equal(t, rbslice, bslice, "mismatched byte slices")
	}

	{
		r, err := r.ReadBytesNoCopy(len(bslice2))
		require.Nil(t, err, "could not do zero-copy read of the bytes")

		rbslice := make([]byte, len(bslice2))
		_, err = io.ReadFull(r, rbslice)
		require.Nil(t, err, "could not read byte slice from reader")
		assert.Equal(t, rbslice, bslice2, "mismatched byte slice from reader")
	}
}
