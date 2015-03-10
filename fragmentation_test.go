package tchannel

import (
	"code.uber.internal/personal/mmihic/tchannel-go/typed"
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestNoFragmentation(t *testing.T) {
	in, out := buildChannels(ChecksumTypeCrc32)

	arg1 := []byte("Hello")
	w := newBodyWriter(out)
	if _, err := w.Write(arg1); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(true))

	// Should be a single frame
	// fragment flags(1), checksum type (1), checksum(5), chunk size(2), chunk(5)
	expectedFrames := typed.CombineBuffers([][]byte{
		[]byte{0x00, byte(ChecksumTypeCrc32)},
		NewCrc32Checksum().Add([]byte("Hello")),
		[]byte{0x00, 0x05},
		[]byte("Hello")})
	assertFramesEqual(t, expectedFrames, out.sentFragments, "no fragmentation")

	r1 := newBodyReader(in, true)
	rarg1 := make([]byte, len(arg1))
	if _, err := r1.Read(rarg1); err != nil {
		require.Nil(t, err)
	}

	assert.Equal(t, arg1, rarg1)
	require.Nil(t, r1.endArgument())
}

func TestFragmentationRoundTrip(t *testing.T) {
	in, out := buildChannels(ChecksumTypeCrc32)

	// Write three arguments, each of which should span fragments
	arg1 := make([]byte, MaxFramePayloadSize*2+756)
	for i := range arg1 {
		arg1[i] = byte(i % 0x0F)
	}
	w := newBodyWriter(out)
	if _, err := w.Write(arg1); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(false))

	arg2 := make([]byte, MaxFramePayloadSize+229)
	for i := range arg2 {
		arg2[i] = byte(i%0x0F) + 0x10
	}
	if _, err := w.Write(arg2); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(false))

	arg3 := make([]byte, MaxFramePayloadSize+72)
	for i := range arg3 {
		arg3[i] = byte(i%0x0F) + 0x20
	}
	if _, err := w.Write(arg3); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(true))

	// Read the three arguments
	r1 := newBodyReader(in, false)

	rarg1 := make([]byte, len(arg1))
	if _, err := r1.Read(rarg1); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg1, rarg1)
	require.Nil(t, r1.endArgument())

	r2 := newBodyReader(in, false)
	rarg2 := make([]byte, len(arg2))
	if _, err := r2.Read(rarg2); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg2, rarg2)
	require.Nil(t, r2.endArgument())

	r3 := newBodyReader(in, true)
	rarg3 := make([]byte, len(arg3))
	if _, err := r3.Read(rarg3); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg3, rarg3)
	require.Nil(t, r3.endArgument())
}

func TestArgEndOnFragmentBoundary(t *testing.T) {
	// Each argument should line up exactly at the end of each fragment
	in, out := buildChannels(ChecksumTypeCrc32)

	// Calculate the number of bytes available in the fragment content, which is the size
	// of the full frame minus the header content for the fragment.  Header content consists of
	// 1 byte flag, 1 byte checksum type, 4 byte checksum value, for a total of 6 bytes
	fragmentContentSize := int(MaxFramePayloadSize) - 6
	arg1 := make([]byte, fragmentContentSize-2) // reserve 2 bytes for the arg chunk size
	for i := range arg1 {
		arg1[i] = byte(i % 0x0F)
	}
	w := newBodyWriter(out)
	if _, err := w.Write(arg1); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(false))

	arg2 := make([]byte, len(arg1)-2) // additional 2 byte trailing size for arg1
	for i := range arg2 {
		arg2[i] = byte(i % 0x1F)
	}
	if _, err := w.Write(arg2); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(false))

	arg3 := make([]byte, len(arg2)) // additional 2 byte trailing size for arg2
	for i := range arg3 {
		arg3[i] = byte(i % 0x2F)
	}
	if _, err := w.Write(arg3); err != nil {
		require.Nil(t, err)
	}
	require.Nil(t, w.endArgument(true))

	// We should have sent 4 fragments (one for arg1, one for zero arg1 size + arg2,
	// one for zero arg2 size + arg3, one for zero arg3 size)
	sentFragments := out.sentFragments
	require.Equal(t, 4, len(sentFragments))
	lastFragment := sentFragments[len(sentFragments)-1]

	// 1 byte flags, 1 byte checksum type, 4 bytes checksum, 2 bytes size (0)
	require.Equal(t, 8, int(lastFragment.Header.Size))
	r1 := newBodyReader(in, false)

	rarg1 := make([]byte, len(arg1))
	if _, err := r1.Read(rarg1); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg1, rarg1)
	require.Nil(t, r1.endArgument())

	r2 := newBodyReader(in, false)
	rarg2 := make([]byte, len(arg2))
	if _, err := r2.Read(rarg2); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg2, rarg2)
	require.Nil(t, r2.endArgument())

	r3 := newBodyReader(in, true)
	rarg3 := make([]byte, len(arg3))
	if _, err := r3.Read(rarg3); err != nil {
		require.Nil(t, err)
	}
	assert.Equal(t, arg3, rarg3)
	require.Nil(t, r3.endArgument())
}

func buildChannels(checksumType ChecksumType) (*inFragments, *outFragments) {
	ch := make(chan *Frame, 512)

	in := &inFragments{ch: ch}
	out := &outFragments{ch: ch, checksum: checksumType.New()}
	return in, out
}

type inFragments struct {
	checksum Checksum
	ch       <-chan *Frame
	current  *inFragment
}

type sampleMessage struct{}

func (m *sampleMessage) Id() uint32                      { return 0xDEADBEEF }
func (m *sampleMessage) Type() MessageType               { return MessageTypeCallReq }
func (m *sampleMessage) read(r typed.ReadBuffer) error   { return nil }
func (m *sampleMessage) write(w typed.WriteBuffer) error { return nil }

func (in *inFragments) waitForFragment() (*inFragment, error) {
	if in.current == nil || !in.current.hasMoreChunks() {
		var err error
		f := <-in.ch
		if in.current, err = newInboundFragment(f, &sampleMessage{}, in.checksum); err != nil {
			return nil, err
		}

		in.checksum = in.current.checksum
	}

	return in.current, nil
}

type outFragments struct {
	fragmentSize  int
	checksum      Checksum
	ch            chan<- *Frame
	sentFragments []*Frame
}

func (out *outFragments) beginFragment() (*outFragment, error) {
	return newOutboundFragment(&Frame{}, &sampleMessage{}, out.checksum)
}

func (out *outFragments) flushFragment(toSend *outFragment, last bool) error {
	f := toSend.finish(last)
	out.ch <- f
	out.sentFragments = append(out.sentFragments, f)
	return nil
}

func assertFramesEqual(t *testing.T, expected [][]byte, frames []*Frame, msg string) {
	assert.Equal(t, len(expected), len(frames), fmt.Sprintf("incorrect number of frames for %s", msg))

	for i := range expected {
		assert.Equal(t, len(expected[i]), int(frames[i].Header.Size),
			fmt.Sprintf("incorrect size for frame %d of %s", i, msg))
		assert.Equal(t, expected[i], frames[i].Payload[:frames[i].Header.Size])
	}
}
