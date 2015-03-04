package tchannel

import (
	"hash"
	"hash/crc32"
)

// The type code for support checksums
type ChecksumType byte

const (
	ChecksumTypeNone     ChecksumType = 0
	ChecksumTypeCrc32    ChecksumType = 1
	ChecksumTypeFarmhash ChecksumType = 2
)

// Returns the size of the checksum for the given type
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

// Interface for a Checksum calculated
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
type NullChecksum struct{}

func (c NullChecksum) TypeCode() ChecksumType { return ChecksumTypeNone }
func (c NullChecksum) Size() int              { return 0 }
func (c NullChecksum) Add(b []byte) []byte    { return nil }
func (c NullChecksum) Sum() []byte            { return nil }

// CRC32 Checksum
type Crc32Checksum struct {
	crc32 hash.Hash32
}

func NewCrc32Checksum() Checksum {
	return &Crc32Checksum{
		crc32: crc32.NewIEEE(),
	}
}

func (c *Crc32Checksum) TypeCode() ChecksumType { return ChecksumTypeCrc32 }
func (c *Crc32Checksum) Size() int              { return crc32.Size }
func (c *Crc32Checksum) Add(b []byte) []byte    { c.crc32.Write(b); return c.Sum() }
func (c *Crc32Checksum) Sum() []byte            { return c.crc32.Sum(nil) }
