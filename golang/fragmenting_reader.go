package tchannel

import (
	"bytes"
	"errors"
	"io"

	"github.com/uber/tchannel/golang/typed"
)

var (
	errChunkExceedsFragmentSize = errors.New("peer chunk size exceeds remaining data in fragment")
	errAlreadyReadingArgument   = errors.New("already reading argument")
	errNotReadingArgument       = errors.New("not reading argument")
	errMoreDataInArgument       = errors.New("more data available in argument")
	errExpectedMoreArguments    = errors.New("more arguments in message")
	errNoMoreFragments          = errors.New("no more fragments")
)

type readableFragment struct {
	flags        byte
	checksumType ChecksumType
	checksum     []byte
	contents     *typed.ReadBuffer
}

type fragmentReceiver interface {
	// recvNextFragment returns the next received fragment, blocking until
	// it's available or a deadline/cancel occurs
	recvNextFragment(intial bool) (*readableFragment, error)
}

type fragmentingReadState int

const (
	fragmentingReadStart fragmentingReadState = iota
	fragmentingReadInArgument
	fragmentingReadWaitingForArgument
	fragmentingReadComplete
)

type fragmentingReader struct {
	state            fragmentingReadState
	remainingChunks  [][]byte
	curChunk         []byte
	hasMoreFragments bool
	receiver         fragmentReceiver
	checksum         Checksum
	err              error
}

func newFragmentingReader(receiver fragmentReceiver) *fragmentingReader {
	return &fragmentingReader{
		receiver:         receiver,
		hasMoreFragments: true,
	}
}

func (r *fragmentingReader) ReadArgument(arg Input, last bool) error {
	if err := r.BeginArgument(); err != nil {
		return err
	}

	if err := arg.ReadFrom(r); err != nil {
		return err
	}

	return r.EndArgument(last)
}

func (r *fragmentingReader) BeginArgument() error {
	if r.err != nil {
		return r.err
	}

	switch r.state {
	case fragmentingReadInArgument:
		r.err = errAlreadyReadingArgument
		return r.err
	case fragmentingReadComplete:
		r.err = errComplete
		return r.err
	}

	// We're guaranteed that either this is the first argument (in which
	// case we need to get the first fragment and chunk) or that we have a
	// valid curChunk (populated via EndArgument)
	if r.state == fragmentingReadStart {
		if r.err = r.recvAndParseNextFragment(true); r.err != nil {
			return r.err
		}
	}

	r.state = fragmentingReadInArgument
	return nil
}

func (r *fragmentingReader) Read(b []byte) (int, error) {
	if r.err != nil {
		return 0, r.err
	}

	if r.state != fragmentingReadInArgument {
		r.err = errNotReadingArgument
		return 0, r.err
	}

	totalRead := 0
	for {
		// Copy as much data as we can from the current chunk
		n := copy(b, r.curChunk)
		totalRead += n
		r.curChunk = r.curChunk[n:]
		b = b[n:]

		if len(b) == 0 {
			// There was enough data in the current chunk to
			// satisfy the read.  Advance our place in the current
			// chunk and be done
			return totalRead, nil
		}

		// There wasn't enough data in the current chunk to satisfy the
		// current read.  If there are more chunks in the current
		// fragment, then we've reach the end of this argument.  Return
		// an io.EOF so functions like ioutil.ReadFully know to finish
		if len(r.remainingChunks) > 0 {
			return totalRead, io.EOF
		}

		// Try to fetch more fragments.  If there are no more
		// fragments, then we've reached the end of the argument
		if !r.hasMoreFragments {
			return totalRead, io.EOF
		}

		if r.err = r.recvAndParseNextFragment(false); r.err != nil {
			return totalRead, r.err
		}
	}
}

func (r *fragmentingReader) EndArgument(last bool) error {
	if r.err != nil {
		return r.err
	}

	if r.state != fragmentingReadInArgument {
		r.err = errNotReadingArgument
		return r.err
	}

	if len(r.curChunk) > 0 {
		// There was more data remaining in the chunk
		r.err = errMoreDataInArgument
		return r.err
	}

	// Several possibilities here:
	// 1. The caller thinks this is the last argument, but there are chunks in the current
	//    fragment or more fragments in this message
	//       - give them an error
	// 2. The caller thinks this is the last argument, and there are no more chunks and no more
	//    fragments
	//       - the stream is complete
	// 3. The caller thinks there are more arguments, and there are more chunks in this fragment
	//       - advance to the next chunk, this is the first chunk for the next argument
	// 4. The caller thinks there are more arguments, and there are no more chunks in this fragment,
	//    but there are more fragments in the message
	//       - retrieve the next fragment, confirm it has an empty chunk (indicating the end of the
	//         current argument), advance to the next check (which is the first chunk for the next arg)
	// 5. The caller thinks there are more arguments, but there are no more chunks or fragments available
	//      - give them an err
	if last {
		if len(r.remainingChunks) > 0 || r.hasMoreFragments {
			// We expect more arguments
			r.err = errExpectedMoreArguments
			return r.err
		}

		r.curChunk = nil
		r.state = fragmentingReadComplete
		return nil
	}

	r.state = fragmentingReadWaitingForArgument

	// If there are more chunks in this fragment, advance to the next chunk.  This is the first chunk
	// for the next argument
	if len(r.remainingChunks) > 0 {
		r.curChunk, r.remainingChunks = r.remainingChunks[0], r.remainingChunks[1:]
		return nil
	}

	// If there are no more chunks in this fragment, and no more fragments, we have an issue
	if !r.hasMoreFragments {
		r.err = errNoMoreFragments
		return r.err
	}

	// There are no more chunks in this fragments, but more fragments - get the next fragment
	if r.err = r.recvAndParseNextFragment(false); r.err != nil {
		return r.err
	}

	return nil
}

func (r *fragmentingReader) recvAndParseNextFragment(initial bool) error {
	if r.err != nil {
		return r.err
	}

	nextFragment, err := r.receiver.recvNextFragment(initial)
	if err != nil {
		return err
	}

	// Set checksum, or confirm new checksum is the same type as the prior checksum
	if r.checksum == nil {
		r.checksum = nextFragment.checksumType.New()
	} else if r.checksum.TypeCode() != nextFragment.checksumType {
		return ErrMismatchedChecksumTypes
	}

	// Split fragment into underlying chunks
	r.hasMoreFragments = (nextFragment.flags & hasMoreFragmentsFlag) == hasMoreFragmentsFlag
	r.remainingChunks = nil
	for nextFragment.contents.BytesRemaining() > 0 && nextFragment.contents.Err() == nil {
		chunkSize := nextFragment.contents.ReadUint16()
		if chunkSize > uint16(nextFragment.contents.BytesRemaining()) {
			return errChunkExceedsFragmentSize
		}
		chunkData := nextFragment.contents.ReadBytes(int(chunkSize))
		r.remainingChunks = append(r.remainingChunks, chunkData)
		r.checksum.Add(chunkData)
	}

	if nextFragment.contents.Err() != nil {
		return nextFragment.contents.Err()
	}

	// Validate checksums
	localChecksum := r.checksum.Sum()
	if bytes.Compare(nextFragment.checksum, localChecksum) != 0 {
		return ErrMismatchedChecksum
	}

	// Pull out the first chunk to act as the current chunk
	r.curChunk, r.remainingChunks = r.remainingChunks[0], r.remainingChunks[1:]
	return nil
}
