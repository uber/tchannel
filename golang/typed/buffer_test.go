package typed

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestReadWrite(t *testing.T) {
	s := "the small brown fix"
	bslice := []byte("jumped over the lazy dog")

	w := NewWriteBufferWithSize(1024)
	w.WriteUint64(0x0123456789ABCDEF)
	w.WriteUint32(0xABCDEF01)
	w.WriteUint16(0x2345)
	w.WriteByte(0xFF)
	w.WriteString(s)
	w.WriteBytes(bslice)

	var b bytes.Buffer
	w.FlushTo(&b)

	r := NewReadBufferWithSize(1024)
	r.FillFrom(bytes.NewReader(b.Bytes()), len(b.Bytes()))

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
}

func TestSeek(t *testing.T) {
	w := NewWriteBufferWithSize(1024)
	pos := w.CurrentPos()
	require.Nil(t, w.WriteUint16(0))
	require.Nil(t, w.WriteString("Hello NYC"))
	endPos := w.CurrentPos()

	require.Nil(t, w.Seek(pos))
	require.Nil(t, w.WriteUint16(uint16(len("Hello NYC"))))
	require.Nil(t, w.Seek(endPos))

	pos = w.CurrentPos()
	require.Nil(t, w.WriteUint16(0)) // We'll come back to this
	require.Nil(t, w.WriteString("The quick brown fox"))
	endPos = w.CurrentPos()

	require.Nil(t, w.Seek(pos))
	require.Nil(t, w.WriteUint16(uint16(len("The quick brown fox"))))
	require.Nil(t, w.Seek(endPos))

	var b bytes.Buffer
	_, err := w.FlushTo(&b)
	require.Nil(t, err)

	r := NewReadBufferWithSize(1024)
	_, err = r.FillFrom(bytes.NewReader(b.Bytes()), w.BytesWritten())
	require.Nil(t, err)

	n, err := r.ReadUint16()
	require.Nil(t, err)

	s, err := r.ReadString(int(n))
	require.Nil(t, err)
	assert.Equal(t, "Hello NYC", s)

	n, err = r.ReadUint16()
	require.Nil(t, err)

	s, err = r.ReadString(int(n))
	require.Nil(t, err)
	assert.Equal(t, "The quick brown fox", s)
}

func TestDeferredWrites(t *testing.T) {
	w := NewWriteBufferWithSize(1024)
	u16ref, err := w.DeferUint16()
	require.Nil(t, err)

	u32ref, err := w.DeferUint32()
	require.Nil(t, err)

	u64ref, err := w.DeferUint64()
	require.Nil(t, err)

	bref, err := w.DeferBytes(5)
	require.Nil(t, err)

	sref, err := w.DeferBytes(5)
	require.Nil(t, err)

	byteref, err := w.DeferByte()
	require.Nil(t, err)

	assert.Equal(t, 2+4+8+5+5+1, w.BytesWritten())

	u16ref.Update(2040)
	u32ref.Update(495404)
	u64ref.Update(0x40950459)
	bref.Update([]byte{0x30, 0x12, 0x45, 0x55, 0x65})
	sref.UpdateString("where")
	byteref.Update(0x44)

	var buf bytes.Buffer
	w.FlushTo(&buf)

	r := NewReadBuffer(buf.Bytes())

	u16, err := r.ReadUint16()
	require.Nil(t, err)
	assert.Equal(t, uint16(2040), u16)

	u32, err := r.ReadUint32()
	require.Nil(t, err)
	assert.Equal(t, uint32(495404), u32)

	u64, err := r.ReadUint64()
	require.Nil(t, err)
	assert.Equal(t, uint32(0x40950459), u64)

	b, err := r.ReadBytes(5)
	require.Nil(t, err)
	assert.Equal(t, []byte{0x30, 0x12, 0x45, 0x55, 0x65}, b)

	s, err := r.ReadString(5)
	require.Nil(t, err)
	assert.Equal(t, "where", s)

	u8, err := r.ReadByte()
	require.Nil(t, err)
	assert.Equal(t, byte(0x44), u8)
}
