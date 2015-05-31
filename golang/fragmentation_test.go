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
	runFragmentationTest(t, []string{"", "", ""}, buffers([][]byte{{
		0x0000,                                                  // flags
		byte(ChecksumTypeCrc32), 0x0000, 0x0000, 0x0000, 0x0000, // empty checksum
		0x0000, 0x0000, // arg 1 (length no body)
		0x0000, 0x0000, // arg 2 (length no body)
		0x0000, 0x0000, // arg 3 (length no body)
	}}))
}

func TestFragmentationSingleFragment(t *testing.T) {
	runFragmentationTest(t, []string{"A", "B", "C"}, buffers([][]byte{{
		0x0000,                                         // flags
		byte(ChecksumTypeCrc32), 0xa3, 0x83, 0x3, 0x48, // CRC32 checksum
		0x0000, 0x0001, 'A', // arg 1 (length single character body)
		0x0000, 0x0001, 'B', // arg 2 (length single character body)
		0x0000, 0x0001, 'C', // arg 3 (length single character body)
	}}))
}

func TestFragmentationMultipleFragments(t *testing.T) {
	runFragmentationTest(t, []string{"ABCDEFHIJKLM", "NOPQRZTUWXYZ", "012345678"}, buffers(
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0x98, 0x43, 0x9a, 0x45, //  checksum
			0x0000, 0x0008, 'A', 'B', 'C', 'D', 'E', 'F', 'H', 'I'}}, // first 8 bytes of arg 1
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0xaf, 0xb9, 0x9c, 0x98, //  checksum
			0x0000, 0x0004, 'J', 'K', 'L', 'M', // remaining 4 bytes of arg 1
			0x0000, 0x0002, 'N', 'O'}}, // all of arg 2 that fits (2 bytes)
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0x23, 0xae, 0x2f, 0x37, //  checksum
			0x0000, 0x0008, 'P', 'Q', 'R', 'Z', 'T', 'U', 'W', 'X'}}, // more aarg 2
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0xa2, 0x93, 0x74, 0xd8, //  checksum
			0x0000, 0x0002, 'Y', 'Z', // last parts of arg 2
			0x0000, 0x0004, '0', '1', '2', '3'}}, // first parts of arg 3
		[][]byte{{
			0x0000,                                          // no more fragments
			byte(ChecksumTypeCrc32), 0xf3, 0x29, 0xbb, 0xd1, // checksum
			0x0000, 0x0005, '4', '5', '6', '7', '8'}},
	))
}

func TestFragmentationMiddleArgNearFragmentBoundary(t *testing.T) {
	// This covers the case where an argument in the middle ends near the
	// end of a fragment boundary, such that there is not enough room to
	// put another argument in the fragment.  In this case there should be
	// an empty chunk for that argument in the next fragment
	runFragmentationTest(t, []string{"ABCDEF", "NOPQ"}, buffers(
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0xbb, 0x76, 0xfe, 0x69, // CRC32 checksum
			0x0000, 0x0006, 'A', 'B', 'C', 'D', 'E', 'F'}}, // all of arg 1
		[][]byte{{
			0x0000,                                          // no more fragments
			byte(ChecksumTypeCrc32), 0x5b, 0x3c, 0x54, 0xfe, // CRC32 checksum
			0x0000, 0x0000, // empty chunk indicating the end of arg 1
			0x0000, 0x0004, 'N', 'O', 'P', 'Q'}}, // all of arg 2
	))

}

func TestFragmentationMiddleArgOnExactFragmentBoundary(t *testing.T) {
	// This covers the case where an argument in the middle ends exactly at the end of a fragment.
	// Again, there should be an empty chunk for that argument in the next fragment
	runFragmentationTest(t, []string{"ABCDEFGH", "NOPQ"}, buffers(
		[][]byte{{
			0x0001,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0x68, 0xdc, 0xb6, 0x1c, // CRC32 checksum
			0x0000, 0x0008, 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'}}, // all of arg 1
		[][]byte{{
			0x0000,                                         // no more fragments
			byte(ChecksumTypeCrc32), 0x32, 0x66, 0xf, 0x25, // CRC32 checksum
			0x0000, 0x0000, // empty chunk indicating the end of arg 1
			0x0000, 0x0004, 'N', 'O', 'P', 'Q'}}, // all of arg 2
	))
}

func TestFragmentationLastArgOnNearFragmentBoundary(t *testing.T) {
	// Covers the case where the last argument ends near a fragment
	// boundary.  No new fragments should get created
	runFragmentationTest(t, []string{"ABCDEF"}, buffers(
		[][]byte{{
			0x0000,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0xbb, 0x76, 0xfe, 0x69, // CRC32 checksum
			0x0000, 0x0006, 'A', 'B', 'C', 'D', 'E', 'F'}}, // all of arg 1
	))
}

func TestFragmentationLastArgOnExactFragmentBoundary(t *testing.T) {
	// Covers the case where the last argument ends exactly on a fragment
	// boundary.  No new fragments should get created
	runFragmentationTest(t, []string{"ABCDEFGH"}, buffers(
		[][]byte{{
			0x0000,                                          // has more fragments
			byte(ChecksumTypeCrc32), 0x68, 0xdc, 0xb6, 0x1c, // CRC32 checksum
			0x0000, 0x0008, 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'}}, // all of arg 1
	))
}

func runFragmentationTest(t *testing.T, args []string, expectedFragments [][]byte) {
	sendCh := make(fragmentChannel, 10)
	recvCh := make(fragmentChannel, 10)

	w := newFragmentingWriter(sendCh, ChecksumTypeCrc32.New())
	r := newFragmentingReader(recvCh)

	var fragments [][]byte
	var actualArgs []string
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

		for i := 0; i < len(args)-1; i++ {
			var arg BytesInput
			require.NoError(t, r.ReadArgument(&arg, false))
			actualArgs = append(actualArgs, string(arg))
		}

		var arg BytesInput
		require.NoError(t, r.ReadArgument(&arg, true))
		actualArgs = append(actualArgs, string(arg))
	}()

	for i := 0; i < len(args)-1; i++ {
		require.NoError(t, w.WriteArgument(BytesOutput(args[i]), false))
	}
	require.NoError(t, w.WriteArgument(BytesOutput(args[len(args)-1]), true))
	close(sendCh)

	wg.Wait()

	assert.Equal(t, args, actualArgs)
	assert.Equal(t, len(expectedFragments), len(fragments), "incorrect number of fragments")
	for i := 0; i < len(expectedFragments); i++ {
		expectedFragment, fragment := expectedFragments[i], fragments[i]
		assert.Equal(t, expectedFragment, fragment, "incorrect fragment %d", i)
	}
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
