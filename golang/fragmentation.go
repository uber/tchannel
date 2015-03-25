package tchannel

// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import (
	"bytes"
	"errors"
	"github.com/uber/tchannel/golang/typed"
	"io"
)

var (
	// ErrMismatchedChecksumTypes is returned when a peer sends a continuation fragment containing
	// a different checksum type from that used for the original message
	ErrMismatchedChecksumTypes = errors.New("peer sent a different checksum type for fragment")

	// ErrWriteAfterComplete is returned when a caller attempts to write to a body after the last fragment was sent
	ErrWriteAfterComplete = errors.New("attempted to write to a stream after the last fragment sent")

	// ErrMismatchedChecksum is returned when a local checksum calculation differs from that reported by peer
	ErrMismatchedChecksum = errors.New("local checksum differs from peer")

	// ErrDataLeftover is returned when a caller considers an argument complete, but there is more data
	// remaining in the argument
	ErrDataLeftover = errors.New("more data remaining in argument")

	errTooLarge                   = errors.New("impl error, data exceeds remaining fragment size")
	errAlignedAtEndOfOpenFragment = errors.New("impl error; align-at-end of open fragment")
	errNoOpenChunk                = errors.New("impl error, writeChunkData or endChunk called with no open chunk")
	errChunkAlreadyOpen           = errors.New("impl error, beginChunk called with an already open chunk")
)

const (
	// Flag indicating there are more fragments to come
	flagMoreFragments = 0x01
)

// An outbound fragment is a fragment being sent to a peer
type outFragment struct {
	frame               *Frame
	checksum            Checksum
	flagsRef            typed.ByteRef
	checksumRef         typed.BytesRef
	currentChunkSizeRef typed.Uint16Ref
	currentChunkSize    int
	content             *typed.WriteBuffer
}

// Returns the number of bytes remaining in the fragment
func (f *outFragment) bytesRemaining() int {
	return f.content.BytesRemaining()
}

// Finishes a fragment, optionally marking it as the last fragment
func (f *outFragment) finish(last bool) *Frame {
	// If we still have a chunk open, close it before finishing the fragment
	if f.chunkOpen() {
		f.endChunk()
	}

	if last {
		f.flagsRef.Update(0)
	} else {
		f.flagsRef.Update(flagMoreFragments)
	}

	f.checksumRef.Update(f.checksum.Sum())
	f.frame.Header.SetPayloadSize(uint16(f.content.BytesWritten()))
	return f.frame
}

// Writes data for a chunked argument into the fragment.  The data must fit into the fragment
func (f *outFragment) writeChunkData(b []byte) (int, error) {
	if !f.chunkOpen() {
		return 0, errNoOpenChunk
	}

	if len(b) > f.bytesRemaining() {
		return 0, errTooLarge
	}

	if err := f.content.WriteBytes(b); err != nil {
		return 0, err
	}

	f.currentChunkSize += len(b)
	f.checksum.Add(b)
	return len(b), nil
}

// Returns true if the fragment can fit a new chunk
func (f *outFragment) canFitNewChunk() bool {
	return f.bytesRemaining() > 2
}

// Begins a new chunk at the current location in the fragment
func (f *outFragment) beginChunk() error {
	if f.chunkOpen() {
		return errChunkAlreadyOpen
	}

	f.currentChunkSizeRef, _ = f.content.DeferUint16()
	f.currentChunkSize = 0
	return nil
}

// Ends a previously opened chunk, recording the chunk size
func (f *outFragment) endChunk() error {
	if !f.chunkOpen() {
		return errNoOpenChunk
	}

	f.currentChunkSizeRef.Update(uint16(f.currentChunkSize))
	f.currentChunkSizeRef = nil
	f.currentChunkSize = 0
	return nil
}

// Returns true if the fragment has a chunk open
func (f *outFragment) chunkOpen() bool { return f.currentChunkSizeRef != nil }

// Creates a new outFragment around a frame and message, with a running checksum
func newOutboundFragment(frame *Frame, msg message, checksum Checksum) (*outFragment, error) {
	f := &outFragment{
		frame:    frame,
		checksum: checksum,
	}

	f.frame.Header.ID = msg.ID()
	f.frame.Header.messageType = msg.messageType()
	f.content = typed.NewWriteBuffer(f.frame.Payload[:])
	f.flagsRef, _ = f.content.DeferByte()

	// Write message specific header
	if err := msg.write(f.content); err != nil {
		return nil, err
	}

	// Write checksum type
	if err := f.content.WriteByte(byte(f.checksum.TypeCode())); err != nil {
		return nil, err
	}

	// Reserve checksum bytes
	f.checksumRef, _ = f.content.DeferBytes(f.checksum.TypeCode().ChecksumSize())
	return f, nil
}

// A pseudo-channel for sending fragments to a remote peer.
// TODO(mmihic): Not happy with this name, or with this exact interface
type outFragmentChannel interface {
	// Opens a fragment for sending.  If there is an existing incomplete fragment on the channel,
	// that fragment will be returned.  Otherwise a new fragment is allocated
	beginFragment() (*outFragment, error)

	// Ends the currently open fragment, optionally marking it as the last fragment
	flushFragment(f *outFragment, last bool) error
}

// An bodyWriter is an io.Writer for a collection of arguments, capable of breaking
// large arguments into multiple chunks spread across several fragments.  Upstream code can
// send argument data via the standard io.Writer interface, but should call endArgument to
// indicate when they are finished with the current argument.
type bodyWriter struct {
	fragments   outFragmentChannel
	fragment    *outFragment
	alignsAtEnd bool
	complete    bool
}

// Creates a new bodyWriter that creates and sends fragments through the provided channel.
func newBodyWriter(ch outFragmentChannel) *bodyWriter {
	return &bodyWriter{fragments: ch}
}

// Writes an entire argument
func (w *bodyWriter) WriteArgument(output Output, last bool) error {
	if err := output.WriteTo(w); err != nil {
		return err
	}

	return w.endArgument(last)
}

// Writes argument bytes, potentially splitting them across fragments
func (w *bodyWriter) Write(b []byte) (int, error) {
	if w.complete {
		return 0, ErrWriteAfterComplete
	}

	if len(b) == 0 {
		return 0, w.writeEmpty()
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

	if _, err := w.finishIfFull(); err != nil {
		return written, err
	}

	return written, nil
}

func (w *bodyWriter) writeEmpty() error {
	// Make sure we have a fragment and an open chunk
	if err := w.ensureOpenChunk(); err != nil {
		return err
	}

	fragmentFlushed, err := w.finishIfFull()
	if err != nil {
		return err
	}

	w.alignsAtEnd = fragmentFlushed
	return nil
}

func (w *bodyWriter) finishIfFull() (bool, error) {
	// If the fragment is complete, send it immediately
	if w.fragment.bytesRemaining() > 0 {
		return false, nil
	}

	if err := w.finishFragment(false); err != nil {
		return false, err
	}

	return true, nil
}

// Ensures that we have a fragment and an open chunk
func (w *bodyWriter) ensureOpenChunk() error {
	for {
		// No fragment - start a new one
		if w.fragment == nil {
			var err error
			if w.fragment, err = w.fragments.beginFragment(); err != nil {
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
func (w *bodyWriter) finishFragment(last bool) error {
	w.fragment.endChunk()
	if err := w.fragments.flushFragment(w.fragment, last); err != nil {
		w.fragment = nil
		return err
	}

	w.fragment = nil
	return nil
}

// Marks the argument as being complete.  If last is true, this is the last argument in the message
func (w *bodyWriter) endArgument(last bool) error {
	if w.alignsAtEnd {
		// The last argument chunk aligned with the end of a fragment boundary - send another fragment
		// containing an empty chunk so readers know the argument is complete
		if w.fragment != nil {
			return errAlignedAtEndOfOpenFragment
		}

		var err error
		w.fragment, err = w.fragments.beginFragment()
		if err != nil {
			return err
		}

		w.fragment.beginChunk()
	}

	if w.fragment.chunkOpen() {
		w.fragment.endChunk()
	}

	if last {
		if err := w.fragments.flushFragment(w.fragment, true); err != nil {
			return err
		}

		w.complete = true
	}

	return nil
}

// An inFragment is a fragment received from a peer
type inFragment struct {
	frame    *Frame   // The frame containing the fragment
	last     bool     // true if this is the last fragment from the peer for this message
	checksum Checksum // Checksum for the fragment chunks
	chunks   [][]byte // The argument chunks contained in the fragment
}

// Creates a new inFragment from an incoming frame and an expected message
func newInboundFragment(frame *Frame, msg message, checksum Checksum) (*inFragment, error) {
	f := &inFragment{
		frame:    frame,
		checksum: checksum,
	}

	payload := f.frame.SizedPayload()
	rbuf := typed.NewReadBuffer(payload)

	// Fragment flags
	flags, err := rbuf.ReadByte()
	if err != nil {
		return nil, err
	}

	f.last = (flags & flagMoreFragments) == 0

	// Message header
	if err := msg.read(rbuf); err != nil {
		return nil, err
	}

	// Checksum type and bytes
	checksumType, err := rbuf.ReadByte()
	if err != nil {
		return nil, err
	}

	if f.checksum == nil {
		f.checksum = ChecksumType(checksumType).New()
	} else if ChecksumType(checksumType) != checksum.TypeCode() {
		return nil, ErrMismatchedChecksumTypes
	}

	peerChecksum, err := rbuf.ReadBytes(f.checksum.TypeCode().ChecksumSize())
	if err != nil {
		return nil, err
	}

	// Slice the remainder into chunks and confirm checksum
	for rbuf.BytesRemaining() > 0 {
		chunkSize, err := rbuf.ReadUint16()
		if err != nil {
			return nil, err
		}

		chunkBytes, err := rbuf.ReadBytes(int(chunkSize))
		if err != nil {
			return nil, err
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
func (f *inFragment) nextChunk() []byte {
	if len(f.chunks) == 0 {
		return nil
	}

	chunk := f.chunks[0]
	f.chunks = f.chunks[1:]
	return chunk
}

// returns true if there are more chunks remaining in the fragment
func (f *inFragment) hasMoreChunks() bool {
	return len(f.chunks) > 0
}

// Psuedo-channel for receiving inbound fragments from a peer
type inFragmentChannel interface {
	// Waits for a fragment to become available.  May return immediately if there is already an open unconsumed
	// fragment, or block until the next fragment appears
	waitForFragment() (*inFragment, error)
}

// An bodyReader is an io.Reader for an individual TChannel argument, capable of reading large
// arguments that have been split across fragments.  Upstream code can use the bodyReader like
// a regular io.Reader to extract the argument data, and should call endArgument when they have finished
// reading a given argument, to prepare the stream for the next argument.
// TODO(mmihic): Refactor to handle all arguments of the body. similar to bodyWriter
type bodyReader struct {
	fragments            inFragmentChannel
	chunk                []byte
	lastChunkForArgument bool
	lastPartInMessage    bool
}

// Reads an input argument from the stream
func (r *bodyReader) ReadArgument(input Input, last bool) error {
	if err := input.ReadFrom(r); err != nil {
		return err
	}

	return r.endArgument()
}

func (r *bodyReader) Read(b []byte) (int, error) {
	totalRead := 0

	for len(b) > 0 {
		if len(r.chunk) == 0 {
			if r.lastChunkForArgument {
				// We've already consumed the last chunk for this argument
				return totalRead, io.EOF
			}

			fragment, err := r.fragments.waitForFragment()
			if err != nil {
				return totalRead, err
			}

			r.chunk = fragment.nextChunk()
			r.lastChunkForArgument = fragment.hasMoreChunks() || fragment.last
		}

		read := copy(b, r.chunk)
		totalRead += read
		r.chunk = r.chunk[read:]
		b = b[read:]
	}

	return totalRead, nil
}

// Marks the current argment as complete, confirming that we've read the entire argumentand have nothing left over
func (r *bodyReader) endArgument() error {
	if len(r.chunk) > 0 {
		return ErrDataLeftover
	}

	if !r.lastChunkForArgument && !r.lastPartInMessage {
		// We finished on a fragment boundary - get the next fragment and confirm there is only a zero
		// length chunk header
		nextFragment, err := r.fragments.waitForFragment()
		if err != nil {
			return err
		}

		r.chunk = nextFragment.nextChunk()
		if len(r.chunk) > 0 {
			return ErrDataLeftover
		}
	}

	if r.lastPartInMessage {
		// TODO(mmihic): Confirm no more chunks in fragment
		// TODO(mmihic): Confirm no more fragments in message
	}

	return nil
}

func newBodyReader(ch inFragmentChannel, last bool) *bodyReader {
	return &bodyReader{fragments: ch, lastPartInMessage: last}
}
