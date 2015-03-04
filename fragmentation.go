package tchannel

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"

	"code.uber.internal/infra/mmihic/tchannel-go/typed"
)

var (
	ErrTooLarge                   = errors.New("data exceeds remaining fragment size")
	ErrMismatchedChecksumTypes    = errors.New("peer sent a different checksum type for fragment")
	ErrMismatchedChecksum         = errors.New("local checksum differs from peer")
	ErrMoreDataInArgument         = errors.New("more data remaining in argument")
	ErrChunkAlreadyOpen           = errors.New("chunk already open")
	ErrNoOpenChunk                = errors.New("no open chunk")
	ErrArgumentComplete           = errors.New("argument is already marked complete")
	ErrAlignedAtEndOfOpenFragment = errors.New("implementation error; align-at-end of open fragment")
)

const (
	flagMoreFragments = 0x01
)

// An outbound fragment is a fragment being sent to a peer
type outboundFragment struct {
	frame         *Frame
	checksum      Checksum
	checksumBytes []byte
	chunkStart    []byte
	chunkSize     int
	remaining     []byte
}

// Returns the number of bytes remaining in the fragment
func (f *outboundFragment) bytesRemaining() int {
	return len(f.remaining)
}

// Finishes a fragment, optionally marking it as the last fragment
func (f *outboundFragment) finish(last bool) *Frame {
	if last {
		f.frame.Payload[0] &= ^byte(flagMoreFragments)
	} else {
		f.frame.Payload[0] |= flagMoreFragments
	}

	copy(f.checksumBytes, f.checksum.Sum())
	f.frame.Header.Size = uint16(len(f.frame.Payload) - len(f.remaining))
	return f.frame
}

// Writes data for a chunked argument into the fragment.  The data must fit into the fragment
func (f *outboundFragment) writeChunkData(b []byte) (int, error) {
	if len(b) > len(f.remaining) {
		return 0, NewWriteIOError("fragment-chunk-data", ErrTooLarge)
	}

	if len(f.chunkStart) == 0 {
		return 0, NewWriteIOError("fragment-chunk-data", ErrNoOpenChunk)
	}

	copy(f.remaining, b)
	f.remaining = f.remaining[len(b):]
	f.chunkSize += len(b)
	f.checksum.Add(b)
	return len(b), nil
}

// Begins a new argument chunk at the current location in the fragment
func (f *outboundFragment) beginChunk() error {
	if len(f.chunkStart) > 0 {
		return NewWriteIOError("fragment-chunk-start", ErrChunkAlreadyOpen)
	}

	f.chunkStart = f.remaining[0:2]
	f.chunkSize = 0
	f.remaining = f.remaining[2:]
	return nil
}

// Ends a previously opened chunk, recording the chunk size
func (f *outboundFragment) endChunk() error {
	if len(f.chunkStart) == 0 {
		return NewWriteIOError("fragment-chunk-end", ErrNoOpenChunk)
	}

	binary.BigEndian.PutUint16(f.chunkStart, uint16(f.chunkSize))
	f.chunkStart = nil
	f.chunkSize = 0
	return nil
}

// Creates a new outboundFragment around a frame and message, with a running checksum
func newOutboundFragment(frame *Frame, msg Message, checksum Checksum) (*outboundFragment, error) {
	f := &outboundFragment{
		frame:    frame,
		checksum: checksum,
	}
	f.frame.Header.Id = msg.Id()
	f.frame.Header.Type = msg.Type()

	wbuf := typed.NewWriteBuffer(f.frame.Payload[:])

	// Reserve fragment flag
	if err := wbuf.WriteByte(0); err != nil {
		return nil, NewWriteIOError("fragment-flag", err)
	}

	// Write message specific header
	if err := msg.write(wbuf); err != nil {
		return nil, NewWriteIOError("fragment-message-header", err)
	}

	// Write checksum type and reserve bytes needed
	if err := wbuf.WriteByte(byte(f.checksum.TypeCode())); err != nil {
		return nil, NewWriteIOError("fragment-checksum-type", err)
	}

	f.remaining = f.frame.Payload[wbuf.CurrentPos():]
	f.checksumBytes = f.remaining[:f.checksum.TypeCode().ChecksumSize()]

	// Everything remaining is available for content
	f.remaining = f.remaining[f.checksum.TypeCode().ChecksumSize():]
	return f, nil
}

// A pseudo-channel for sending fragments to a remote peer.
// TODO(mmihic): Not happy with this name, or with this exact interface
type outboundFragmentChannel interface {
	// Opens a fragment for sending.  If there is an existing incomplete fragment on the channel,
	// that fragment will be returned.  Otherwise a new fragment is allocated
	openFragment() (*outboundFragment, error)

	// Sends the current open fragment, optionally marking it as the last fragment
	sendFragment(last bool) error
}

// An ArgumentWriter is an io.Writer for an individual TChannel argument, capable of breaking
// large arguments into multiple chunks spread across several fragments.  Upstream code can
// send argument data via the standard io.Writer interface, but should call EndArgument to
// indicate when they are finished with the current argument to setup the stream for the
// next argument in the list (or to complete the message, if this is the last argument)
type ArgumentWriter struct {
	fragments        outboundFragmentChannel
	fragment         *outboundFragment
	alignsAtEnd      bool
	complete         bool
	lastArgInMessage bool
}

// Creates a new ArgumentWriter that creates and sends fragments through the provided channel.  If last
// is true, this is the final argument in the message, and the message will be marked complete once
// the argument is fully streamed.
func newArgumentWriter(ch outboundFragmentChannel, last bool) *ArgumentWriter {
	return &ArgumentWriter{fragments: ch, lastArgInMessage: last}
}

// Writes argument bytes, potentially splitting them across fragments
func (w *ArgumentWriter) Write(b []byte) (int, error) {
	if w.complete {
		return 0, ErrArgumentComplete
	}

	written := 0
	for len(b) > 0 {
		w.alignsAtEnd = false
		if w.fragment == nil {
			var err error
			w.fragment, err = w.fragments.openFragment()
			if err != nil {
				return written, err
			}

			if w.fragment.bytesRemaining() > 2 {
				w.fragment.beginChunk()
			} else {
				// Not even enough room for the chunk header, send and start a new fragment
				w.fragments.sendFragment(false)
				w.fragment = nil
				continue
			}
		}

		bytesRemaining := w.fragment.bytesRemaining()
		if bytesRemaining < len(b) {
			// Not enough space remaining in this fragment - send what we can and start a new fragment
			if n, err := w.fragment.writeChunkData(b[:bytesRemaining]); err != nil {
				return written + n, err
			}

			written += bytesRemaining

			w.fragment.endChunk()
			if err := w.fragments.sendFragment(false); err != nil {
				return written, err
			}

			w.fragment = nil
			b = b[bytesRemaining:]
		} else {
			if n, err := w.fragment.writeChunkData(b); err != nil {
				return written + n, err
			}

			written += len(b)

			// If we filled the fragment, send it on down
			if w.fragment.bytesRemaining() == 0 {
				w.fragment.endChunk()
				if err := w.fragments.sendFragment(false); err != nil {
					return written, err
				}

				w.fragment = nil
				w.alignsAtEnd = true
			} else {
				w.alignsAtEnd = false
			}

			b = nil
		}
	}

	return written, nil
}

// Marks the argument as being complete
func (w *ArgumentWriter) EndArgument() error {
	if w.alignsAtEnd {
		// The last argument chunk aligned with the end of a fragment boundary - send another fragment
		// containing an empty chunk so readers know the argument is complete
		if w.fragment != nil {
			return ErrAlignedAtEndOfOpenFragment
		}

		var err error
		w.fragment, err = w.fragments.openFragment()
		if err != nil {
			return err
		}

		w.fragment.beginChunk()
	}

	if w.fragment != nil {
		w.fragment.endChunk()
		if w.lastArgInMessage {
			if err := w.fragments.sendFragment(true); err != nil {
				return err
			}
		}
	}

	w.fragment = nil
	w.complete = true
	return nil
}

// An inboundFragment is a fragment received from a peer
type inboundFragment struct {
	frame    *Frame   // The frame containing the fragment
	last     bool     // true if this is the last fragment from the peer for this message
	checksum Checksum // Checksum for the fragment chunks
	chunks   [][]byte // The argument chunks contained in the fragment
}

// Creates a new inboundFragment from an incoming frame and an expected message
func newInboundFragment(frame *Frame, msg Message, checksum Checksum) (*inboundFragment, error) {
	f := &inboundFragment{
		frame:    frame,
		checksum: checksum,
	}

	payload := f.frame.Payload[:f.frame.Header.Size]
	rbuf := typed.NewReadBuffer(payload)

	// Fragment flags
	flags, err := rbuf.ReadByte()
	if err != nil {
		return nil, NewReadIOError("fragment-flags", err)
	}

	f.last = (flags & flagMoreFragments) == 0

	// Message header
	if err := msg.read(rbuf); err != nil {
		return nil, NewReadIOError("fragment-msg-header", err)
	}

	// Read checksum type and bytes
	checksumType, err := rbuf.ReadByte()
	if err != nil {
		return nil, NewReadIOError("fragment-checksum-type", err)
	}

	if f.checksum == nil {
		f.checksum = ChecksumType(checksumType).New()
	} else if ChecksumType(checksumType) != checksum.TypeCode() {
		return nil, ErrMismatchedChecksumTypes
	}

	peerChecksum, err := rbuf.ReadBytes(f.checksum.TypeCode().ChecksumSize())
	if err != nil {
		return nil, NewReadIOError("fragment-checksum", err)
	}

	// Slice the remainder into chunks and confirm checksum
	for rbuf.BytesRemaining() > 0 {
		chunkSize, err := rbuf.ReadUint16()
		if err != nil {
			return nil, NewReadIOError("chunk-size", err)
		}

		chunkBytes, err := rbuf.ReadBytes(int(chunkSize))
		if err != nil {
			return nil, NewReadIOError("input-chunk-data", err)
		}

		f.chunks = append(f.chunks, chunkBytes)
		f.checksum.Add(chunkBytes)
	}

	// Compare checksums
	if bytes.Compare(peerChecksum, f.checksum.Sum()) != 0 {
		return nil, ErrMismatchedChecksum
	}

	return f, nil
}

// Consumes the next chunk in the fragment
func (f *inboundFragment) nextChunk() []byte {
	if len(f.chunks) == 0 {
		return nil
	}

	chunk := f.chunks[0]
	f.chunks = f.chunks[1:]
	return chunk
}

// returns true if there are more chunks remaining in the fragment
func (f *inboundFragment) hasMoreChunks() bool {
	return len(f.chunks) > 0
}

// Psuedo-channel for receiving inbound fragments from a peer
type inboundFragmentChannel interface {
	// Waits for a fragment to become available.  May return immediately if there is already an open unconsumed
	// fragment, or block until the next fragment appears
	waitForFragment() (*inboundFragment, error)
}

// An ArgumentReader is an io.Reader for an individual TChannel argument, capable of reading large
// arguments that have been split across fragments.  Upstream code can use the ArgumentReader like
// a regular io.Reader to extract the argument bytes, and should call EndArgument when they have finished
// reading a given argument, to prepare the stream for the next argument.
type ArgumentReader struct {
	fragments           inboundFragmentChannel
	chunk               []byte
	alignOnEnd          bool
	lastChunkInFragment bool
	lastArgInMessage    bool
}

func (r *ArgumentReader) Read(b []byte) (int, error) {
	read := 0

	for len(b) > 0 {
		r.alignOnEnd = false
		if len(r.chunk) == 0 {
			if r.lastChunkInFragment {
				// We've already consumed the last chunk for this argument
				return read, NewReadIOError("chunk-data-last-chunk", io.EOF)
			}

			nextFragment, err := r.fragments.waitForFragment()
			if err != nil {
				return read, err
			}

			r.chunk = nextFragment.nextChunk()
			r.lastChunkInFragment = nextFragment.hasMoreChunks() // Remaining chunks are for other args
		}

		read += copy(b, r.chunk)
		if len(b) <= len(r.chunk) {
			// We can satisfy the entire requested byte stream from the current chunk
			r.chunk = r.chunk[len(b):]
			r.alignOnEnd = len(r.chunk) == 0 && !r.lastChunkInFragment
			b = nil
		} else if r.lastChunkInFragment {
			// The last chunk we read was the last chunk for this argument, so there is no
			// more data available for this argument
			return read, NewReadIOError("premature-end-of-argument", io.EOF)
		} else {
			// There might be more data for this argument in another fragment, wait for that fragment
			b = b[len(r.chunk):]
			r.chunk = nil
		}
	}

	return read, nil
}

// Marks the current argument as complete, confirming that we've read the entire argument and have nothing left over
func (r *ArgumentReader) EndArgument() error {
	if len(r.chunk) > 0 {
		return ErrMoreDataInArgument
	}

	if r.alignOnEnd && !r.lastArgInMessage {
		// We finished on a fragment boundary - get the next fragment and confirm there is only a zero
		// length chunk header
		nextFragment, err := r.fragments.waitForFragment()
		if err != nil {
			return err
		}

		r.chunk = nextFragment.nextChunk()
		if len(r.chunk) > 0 {
			return ErrMoreDataInArgument
		}
	}

	if r.lastArgInMessage {
		// TODO(mmihic): Confirm no more chunks in fragment
		// TODO(mmihic): Confirm no more fragments in message
	}

	return nil
}

func newArgumentReader(ch inboundFragmentChannel, last bool) *ArgumentReader {
	return &ArgumentReader{fragments: ch, lastArgInMessage: last}
}
