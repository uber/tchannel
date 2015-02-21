package binio

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestReadWrite(t *testing.T) {
	var b bytes.Buffer
	w := NewWriter(&b)
	w.WriteUint64(0x0123456789ABCDEF)
	w.WriteUint32(0xABCDEF01)
	w.WriteUint16(0x2345)
	w.WriteByte(0xFF)
	w.WriteString("the small brown fox")
	w.WriteBytes([]byte("jumped over the lazy dog"))
	w.Flush()

	r := NewReader(bytes.NewReader(b.Bytes()))
	assert.Equal(t, r.ReadUint64(), uint64(0x0123456789ABCDEF), "mismatched uint64")
	assert.Equal(t, r.ReadUint32(), uint32(0xABCDEF01), "mismatched uint32")
	assert.Equal(t, r.ReadUint16(), uint16(0x2345), "mismatched uint16")
	assert.Equal(t, r.ReadByte(), byte(0xFF), "mismatched byte")
	assert.Equal(t, r.ReadString(len("the small brown fox")), "the small brown fox", "mismatched string")
	assert.Equal(t, r.ReadBytes(len("jumped over the lazy dog")),
		[]byte("jumped over the lazy dog"), "mismatched bytes")

	assert.Nil(t, r.ReadError(), "had a read error")
}
