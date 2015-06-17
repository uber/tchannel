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
	"fmt"
	"io"
	"math"

	"github.com/uber/tchannel/golang/typed"
)

const (
	// MaxFrameSize is the total maximum size for a frame
	MaxFrameSize = math.MaxUint16

	// FrameHeaderSize is the size of the header element for a frame
	FrameHeaderSize = 16

	// MaxFramePayloadSize is the maximum size of the payload for a single frame
	MaxFramePayloadSize = MaxFrameSize - FrameHeaderSize
)

// FrameHeader is the header for a frame, containing the MessageType and size
type FrameHeader struct {
	// The size of the frame including the header
	size uint16

	// The type of message represented by the frame
	messageType messageType

	// Left empty
	reserved1 byte

	// The id of the message represented by the frame
	ID uint32

	// Left empty
	reserved [8]byte
}

// SetPayloadSize sets the size of the frame payload
func (fh *FrameHeader) SetPayloadSize(size uint16) {
	fh.size = size + FrameHeaderSize
}

// PayloadSize returns the size of the frame payload
func (fh FrameHeader) PayloadSize() uint16 {
	return fh.size - FrameHeaderSize
}

// FrameSize returns the total size of the frame
func (fh FrameHeader) FrameSize() uint16 {
	return fh.size
}

func (fh FrameHeader) String() string { return fmt.Sprintf("%v[%d]", fh.messageType, fh.ID) }

func (fh *FrameHeader) read(r *typed.ReadBuffer) error {
	fh.size = r.ReadUint16()
	fh.messageType = messageType(r.ReadByte())
	fh.reserved1 = r.ReadByte()
	fh.ID = r.ReadUint32()
	r.ReadBytes(len(fh.reserved))
	return r.Err()
}

func (fh *FrameHeader) write(w *typed.WriteBuffer) error {
	w.WriteUint16(fh.size)
	w.WriteByte(byte(fh.messageType))
	w.WriteByte(fh.reserved1)
	w.WriteUint32(fh.ID)
	w.WriteBytes(fh.reserved[:])
	return w.Err()
}

// A Frame is a header and payload
type Frame struct {
	buffer       []byte // full buffer, including payload and header
	headerBuffer []byte // slice referencing just the header

	// The header for the frame
	Header FrameHeader

	// The payload for the frame
	Payload []byte
}

// NewFrame allocates a new frame with the given payload capacity
func NewFrame(payloadCapacity int) *Frame {
	f := &Frame{}
	f.buffer = make([]byte, payloadCapacity+FrameHeaderSize)
	f.Payload = f.buffer[FrameHeaderSize:]
	f.headerBuffer = f.buffer[:FrameHeaderSize]
	return f
}

// ReadFrom reads the frame from the given io.Reader
func (f *Frame) ReadFrom(r io.Reader) error {
	var rbuf typed.ReadBuffer
	rbuf.Wrap(f.headerBuffer)

	if _, err := rbuf.FillFrom(r, FrameHeaderSize); err != nil {
		return err
	}

	if err := f.Header.read(&rbuf); err != nil {
		return err
	}

	if f.Header.PayloadSize() > 0 {
		if _, err := r.Read(f.SizedPayload()); err != nil {
			return err
		}
	}

	return nil
}

// WriteTo writes the frame to the given io.Writer
func (f *Frame) WriteTo(w io.Writer) error {
	var wbuf typed.WriteBuffer
	wbuf.Wrap(f.headerBuffer)

	if err := f.Header.write(&wbuf); err != nil {
		return err
	}

	fullFrame := f.buffer[:f.Header.FrameSize()]
	if _, err := w.Write(fullFrame); err != nil {
		return err
	}

	return nil
}

// SizedPayload returns the slice of the payload actually used, as defined by the header
func (f *Frame) SizedPayload() []byte {
	return f.Payload[:f.Header.PayloadSize()]
}

func (f *Frame) write(msg message) error {
	var wbuf typed.WriteBuffer
	wbuf.Wrap(f.Payload[:])
	if err := msg.write(&wbuf); err != nil {
		return err
	}

	f.Header.ID = msg.ID()
	f.Header.messageType = msg.messageType()
	f.Header.SetPayloadSize(uint16(wbuf.BytesWritten()))
	return nil
}

func (f *Frame) read(msg message) error {
	var rbuf typed.ReadBuffer
	rbuf.Wrap(f.SizedPayload())
	return msg.read(&rbuf)
}
