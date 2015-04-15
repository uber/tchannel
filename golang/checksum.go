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
	"hash"
	"hash/crc32"
)

var (
	crc32CastagnoliTable = crc32.MakeTable(crc32.Castagnoli)
)

// A ChecksumType is a checksum algorithm supported by TChannel for checksumming call bodies
type ChecksumType byte

const (
	// ChecksumTypeNone indicates no checksum is included in the message
	ChecksumTypeNone ChecksumType = 0

	// ChecksumTypeCrc32 indicates the message checksum is calculated using crc32
	ChecksumTypeCrc32 ChecksumType = 1

	// ChecksumTypeFarmhash indicates the message checksum is calculated using Farmhash
	ChecksumTypeFarmhash ChecksumType = 2

	// ChecksumTypeCrc32C indicates the message checksum is calculated using crc32c
	ChecksumTypeCrc32C ChecksumType = 3
)

// ChecksumSize returns the size in bytes of the checksum calculation
func (t ChecksumType) ChecksumSize() int {
	switch t {
	case ChecksumTypeNone:
		return 0
	case ChecksumTypeCrc32, ChecksumTypeCrc32C:
		return crc32.Size
	case ChecksumTypeFarmhash:
		return 4
	default:
		return 0
	}
}

// New creates a new Checksum of the given type
func (t ChecksumType) New() Checksum {
	switch t {
	case ChecksumTypeNone:
		return nullChecksum{}
	case ChecksumTypeCrc32:
		return &crc32Checksum{crc32: crc32.NewIEEE()}
	case ChecksumTypeCrc32C:
		return &crc32Checksum{crc32: crc32.New(crc32CastagnoliTable)}
	case ChecksumTypeFarmhash:
		// TODO(mmihic): Implement
		return nil

	default:
		return nil
	}
}

// A Checksum calculates a running checksum against a bytestream
type Checksum interface {
	// TypeCode returns the type of this checksum
	TypeCode() ChecksumType

	// Size returns the size of the calculated checksum
	Size() int

	// Add adds bytes to the checksum calculation
	Add(b []byte) []byte

	// Sum returns the current checksum value
	Sum() []byte
}

// No checksum
type nullChecksum struct{}

// TypeCode returns the type of the checksum
func (c nullChecksum) TypeCode() ChecksumType { return ChecksumTypeNone }

// Size returns the size of the checksum data, in the case the null checksum this is zero
func (c nullChecksum) Size() int { return 0 }

// Add adds a byteslice to the checksum calculation
func (c nullChecksum) Add(b []byte) []byte { return nil }

// Sum returns the current checksum calculation
func (c nullChecksum) Sum() []byte { return nil }

// CRC32 Checksum
type crc32Checksum struct {
	crc32 hash.Hash32
}

// TypeCode returns the type of the checksum
func (c *crc32Checksum) TypeCode() ChecksumType { return ChecksumTypeCrc32 }

// Size returns the size of the checksum data
func (c *crc32Checksum) Size() int { return crc32.Size }

// Add adds a byte slice to the checksum calculation
func (c *crc32Checksum) Add(b []byte) []byte { c.crc32.Write(b); return c.Sum() }

// Sum returns the current value of the checksum calculation
func (c *crc32Checksum) Sum() []byte { return c.crc32.Sum(nil) }
