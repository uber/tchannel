package binio

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestReadWrite(t *testing.T) {
	s := "the small brown fix"
	bslice := []byte("jumped over the lazy dog")

	var b bytes.Buffer
	w := NewWriter(&b)
	w.WriteUint64(0x0123456789ABCDEF)
	w.WriteUint32(0xABCDEF01)
	w.WriteUint16(0x2345)
	w.WriteByte(0xFF)
	w.WriteString(s)
	w.WriteBytes(bslice)
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

		s2, err := r.ReadString(len(s))
		assert.Nil(t, err, "could not read string")
		assert.Equal(t, s2, s, "mismatched string")
	}
	{
		bslice2, err := r.ReadBytes(len(bslice))
		assert.Nil(t, err, "could not read byte slice")
		assert.Equal(t, bslice2, bslice, "mismatched byte slices")
	}
}
