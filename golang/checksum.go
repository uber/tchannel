package tchannel

import (
	"hash"
	"hash/crc32"
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
)

// ChecksumSize returns the size in bytes of the checksum calculation
func (t ChecksumType) ChecksumSize() int {
	switch t {
	case ChecksumTypeNone:
		return 0
	case ChecksumTypeCrc32:
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
	case ChecksumTypeFarmhash:
		// TODO(mmihic): Implement
		return nil

	default:
		return nil
	}
}

// A Checksum calculates a running checksum against a bytestream
type Checksum interface {
	// The typecode for this checksum
	TypeCode() ChecksumType

	// The size of the checksum
	Size() int

	// Adds bytes to the checksum calculation
	Add(b []byte) []byte

	// Calculates the current checksum value
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
