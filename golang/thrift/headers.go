package thrift

import (
	"fmt"
	"io"
	"io/ioutil"

	"github.com/uber/tchannel/golang/typed"
)

// TODO(prashant): Use a small buffer and then flush it when it's full.
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

// TODO(prashant): Allow typed.ReadBuffer to read directly from the reader.
func readHeaders(r io.Reader) (map[string]string, error) {
	bs, err := ioutil.ReadAll(r)
	if err != nil {
		return nil, err
	}

	buffer := typed.NewReadBuffer(bs)
	numHeaders := buffer.ReadUint16()
	if numHeaders == 0 {
		return nil, nil
	}

	headers := make(map[string]string)
	for i := 0; i < int(numHeaders); i++ {
		k := buffer.ReadLen16String()
		v := buffer.ReadLen16String()
		headers[k] = v
	}
	return headers, buffer.Err()
}
