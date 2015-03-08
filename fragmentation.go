package tchannel

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"

	"code.uber.internal/personal/mmihic/tchannel-go/typed"
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
	// Flag indicating there are more fragments to come
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
	// If we still have a chunk open, close it before finishing the fragment
	if f.chunkOpen() {
		f.endChunk()
	}

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

// Returns true if the fragment can fit a new chunk
func (f *outboundFragment) canFitNewChunk() bool {
	return len(f.remaining) > 2
}

// Begins a new argument chunk at the current location in the fragment
func (f *outboundFragment) beginChunk() error {
	if f.chunkOpen() {
		return NewWriteIOError("fragment-chunk-start", ErrChunkAlreadyOpen)
	}

	f.chunkStart = f.remaining[0:2]
	f.chunkSize = 0
	f.remaining = f.remaining[2:]
	return nil
}

// Ends a previously opened chunk, recording the chunk size
func (f *outboundFragment) endChunk() error {
	if !f.chunkOpen() {
		return NewWriteIOError("fragment-chunk-end", ErrNoOpenChunk)
	}

	binary.BigEndian.PutUint16(f.chunkStart, uint16(f.chunkSize))
	f.chunkStart = nil
	f.chunkSize = 0
	return nil
}

// Returns true if the fragment has a chunk open
func (f *outboundFragment) chunkOpen() bool { return len(f.chunkStart) > 0 }

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
	startFragment() (*outboundFragment, error)

	// Ends the currently open fragment, optionally marking it as the last fragment
	sendFragment(f *outboundFragment, last bool) error
}

// An ArgumentWriter is an io.Writer for a collection of arguments, capable of breaking
// large arguments into multiple chunks spread across several fragments.  Upstream code can
// send argument data via the standard io.Writer interface, but should call EndArgument to
// indicate when they are finished with the current argument to setup the stream for the
// next argument in the list (or to complete the message, if this is the last argument)
type ArgumentWriter struct {
	fragments   outboundFragmentChannel
	fragment    *outboundFragment
	alignsAtEnd bool
	complete    bool
}

// Creates a new ArgumentWriter that creates and sends fragments through the provided channel.
func newArgumentWriter(ch outboundFragmentChannel) *ArgumentWriter {
	return &ArgumentWriter{fragments: ch}
}

// Writes argument bytes, potentially splitting them across fragments
func (w *ArgumentWriter) Write(b []byte) (int, error) {
	if w.complete {
		return 0, ErrArgumentComplete
	}

	written := 0
	for len(b) > 0 {
		// Make sure we have a fragment and an open chunk
		if err := w.ensureOpenChunk(); err != nil {
			return written, err
		}

		bytesRemaining := w.fragment.bytesRemaining()
		if bytesRemaining < len(b) {
			// Not enough space remaining in this fragment - write what we can, finish this fragment,
			// and start a new fragment for the remainder of the argument
			if n, err := w.fragment.writeChunkData(b[:bytesRemaining]); err != nil {
				return written + n, err
			}

			if err := w.finishFragment(false); err != nil {
				return written, err
			}

			written += bytesRemaining
			b = b[bytesRemaining:]
		} else {
			// Enough space remaining in this fragment - write the full chunk and be done with it
			if n, err := w.fragment.writeChunkData(b); err != nil {
				return written + n, err
			}

			written += len(b)
			w.alignsAtEnd = w.fragment.bytesRemaining() == 0
			b = nil
		}
	}

	// If the fragment is complete, send it immediately
	if w.fragment.bytesRemaining() == 0 {
		if err := w.finishFragment(false); err != nil {
			return written, err
		}
	}

	return written, nil
}

// Ensures that we have a fragment and an open chunk
func (w *ArgumentWriter) ensureOpenChunk() error {
	for {
		// No fragment - start a new one
		if w.fragment == nil {
			var err error
			if w.fragment, err = w.fragments.startFragment(); err != nil {
				return err
			}
		}

		// Fragment has an open chunk - we are good to go
		if w.fragment.chunkOpen() {
			return nil
		}

		// Fragment can fit a new chunk - start it and hand off
		if w.fragment.canFitNewChunk() {
			w.fragment.beginChunk()
			return nil
		}

		// Fragment cannot fit the new chunk - finish the current fragment and get a new one
		if err := w.finishFragment(false); err != nil {
			return err
		}
	}
}

// Finishes with the current fragment, closing any open chunk and sending the fragment down the channel
func (w *ArgumentWriter) finishFragment(last bool) error {
	w.fragment.endChunk()
	if err := w.fragments.sendFragment(w.fragment, last); err != nil {
		w.fragment = nil
		return err
	}

	w.fragment = nil
	return nil
}

// Marks the argument as being complete.  If last is true, this is the last argument in the message
func (w *ArgumentWriter) EndArgument(last bool) error {
	if w.alignsAtEnd {
		// The last argument chunk aligned with the end of a fragment boundary - send another fragment
		// containing an empty chunk so readers know the argument is complete
		if w.fragment != nil {
			return ErrAlignedAtEndOfOpenFragment
		}

		var err error
		w.fragment, err = w.fragments.startFragment()
		if err != nil {
			return err
		}

		w.fragment.beginChunk()
	}

	if w.fragment.chunkOpen() {
		w.fragment.endChunk()
	}

	if last {
		if err := w.fragments.sendFragment(w.fragment, true); err != nil {
			return err
		}

		w.complete = true
	}

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
	lastChunkInFragment bool
	lastArgInMessage    bool
}

func (r *ArgumentReader) Read(b []byte) (int, error) {
	totalRead := 0

	for len(b) > 0 {
		if len(r.chunk) == 0 {
			if r.lastChunkInFragment {
				// We've already consumed the last chunk for this argument
				return totalRead, io.EOF
			}

			nextFragment, err := r.fragments.waitForFragment()
			if err != nil {
				return totalRead, err
			}

			r.chunk = nextFragment.nextChunk()
			r.lastChunkInFragment = nextFragment.hasMoreChunks() // Remaining chunks are for other args
		}

		read := copy(b, r.chunk)
		totalRead += read
		r.chunk = r.chunk[read:]
		b = b[read:]
	}

	return totalRead, nil
}

// Marks the current argument as complete, confirming that we've read the entire argument and have nothing left over
func (r *ArgumentReader) EndArgument() error {
	if len(r.chunk) > 0 {
		return ErrMoreDataInArgument
	}

	if !r.lastChunkInFragment && !r.lastArgInMessage {
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
