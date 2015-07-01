package thrift

import (
	"encoding/binary"
	"fmt"
	"io"

	"github.com/uber/tchannel/golang/typed"
)

// TODO(prashant): Refactor tchannel/typed so we can reuse it here.

func writeHeaders(w io.Writer, headers map[string]string) error {
	// Calculate the size of the buffer that we need.
	size := 2
	for k, v := range headers {
		size += 4 /* size of key/value lengths */
		size += len(k) + len(v)
	}

	buf := make([]byte, size)
	writeBuffer := typed.NewWriteBuffer(buf)
	writeBuffer.WriteUint16(uint16(len(headers)))
	for k, v := range headers {
		writeBuffer.WriteLen16String(k)
		writeBuffer.WriteLen16String(v)
	}

	if err := writeBuffer.Err(); err != nil {
		return err
	}

	// Safety check to ensure the bytes written calculation is correct.
	if writeBuffer.BytesWritten() != size {
		return fmt.Errorf("writeHeaders size calculation wrong, expected to write %v bytes, only wrote %v bytes",
			size, writeBuffer.BytesWritten())
	}

	_, err := writeBuffer.FlushTo(w)
	return err
}

func readHeaders(r io.Reader) (map[string]string, error) {
	var err error

	readUInt16 := func() uint16 {
		if err != nil {
			return 0
		}
		var data uint16
		err = binary.Read(r, binary.BigEndian, &data)
		return data
	}

	readString := func(length uint16) []byte {
		if err != nil || length == 0 {
			return nil
		}
		data := make([]byte, length)
		_, err = io.ReadFull(r, data)
		return data
	}

	headerLen := readUInt16()
	if headerLen == 0 {
		return nil, err
	}

	headers := make(map[string]string)
	for i := uint16(0); i < headerLen; i++ {
		klen := readUInt16()
		k := readString(klen)
		vlen := readUInt16()
		v := readString(vlen)
		headers[string(k)] = string(v)
	}

	return headers, err
}
