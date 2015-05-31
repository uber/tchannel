package tchannel

import (
	"bytes"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/typed"
)

const (
	testFragmentHeaderSize = 1 /* flags */ + 1 /* checksum type */ + 4 /* CRC32 checksum */

	testFragmentPayloadSize = 10 // enough room for a small payload
	testFragmentSize        = testFragmentHeaderSize + testFragmentPayloadSize
)

func TestFragmentationEmptyArgs(t *testing.T) {
	sendCh := make(fragmentChannel, 10)
	recvCh := make(fragmentChannel, 10)

	w := newFragmentingWriter(sendCh, ChecksumTypeCrc32.New())
	r := newFragmentingReader(recvCh)

	var fragments [][]byte
	var args [][]byte
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for fragment := range sendCh {
			fragments = append(fragments, fragment)
			recvCh <- fragment
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()

		var arg BytesInput
		require.NoError(t, r.ReadArgument(&arg, false))
		args = append(args, arg)
		arg = nil
		require.NoError(t, r.ReadArgument(&arg, false))
		args = append(args, arg)
		arg = nil
		require.NoError(t, r.ReadArgument(&arg, true))
		args = append(args, arg)
		arg = nil
	}()

	require.NoError(t, w.WriteArgument(BytesOutput(nil), false))
	require.NoError(t, w.WriteArgument(BytesOutput(nil), false))
	require.NoError(t, w.WriteArgument(BytesOutput(nil), true))
	close(sendCh)

	wg.Wait()
	assert.Equal(t, [][]byte{[]byte{}, []byte{}, []byte{}}, args)

	// Make sure the fragments look as we expected
	expectedFragments := buffers([][]byte{{
		0x00, // flags
		byte(ChecksumTypeCrc32), 0x00, 0x00, 0x00, 0x00, // empty checksum
		0x00, 0x00, // arg 1 (length no body)
		0x00, 0x00, // arg 2 (length no body)
		0x00, 0x00}, // arg 3 (length no body)
	})
	assert.Equal(t, expectedFragments, fragments)
}

func TestSingleFragment(t *testing.T) {
}

func TestMultipleFragments(t *testing.T) {
}

func TestMiddleArgOnFragmentBoundary(t *testing.T) {
}

func TestLastArgOnFragmentBoundary(t *testing.T) {
}

type fragmentChannel chan []byte

func (ch fragmentChannel) newFragment(initial bool, checksum Checksum) (*writableFragment, error) {
	wbuf := typed.NewWriteBuffer(make([]byte, testFragmentSize))
	fragment := new(writableFragment)
	fragment.flagsRef = wbuf.DeferByte()
	wbuf.WriteByte(byte(checksum.TypeCode()))
	fragment.checksumRef = wbuf.DeferBytes(checksum.Size())
	fragment.checksum = checksum
	fragment.contents = wbuf
	return fragment, wbuf.Err()
}

func (ch fragmentChannel) flushFragment(fragment *writableFragment) error {
	var buf bytes.Buffer
	fragment.contents.FlushTo(&buf)
	ch <- buf.Bytes()
	return nil
}

func (ch fragmentChannel) recvNextFragment(initial bool) (*readableFragment, error) {
	rbuf := typed.NewReadBuffer(<-ch)
	fragment := new(readableFragment)
	fragment.flags = rbuf.ReadByte()
	fragment.checksumType = ChecksumType(rbuf.ReadByte())
	fragment.checksum = rbuf.ReadBytes(fragment.checksumType.ChecksumSize())
	fragment.contents = rbuf
	return fragment, rbuf.Err()
}

func buffers(elements ...[][]byte) [][]byte {
	var buffers [][]byte
	for i := range elements {
		buffers = append(buffers, bytes.Join(elements[i], []byte{}))
	}

	return buffers
}
