package thrift

import (
	"encoding/binary"
	"io"
)

// TODO(prashant): Refactor tchannel/typed so we can reuse it here.

func writeHeaders(w io.Writer, headers map[string]string) error {
	var err error
	writeBinary := func(data interface{}) {
		if err != nil {
			return
		}
		err = binary.Write(w, binary.BigEndian, data)
	}
	writeBinary(uint16(len(headers)))
	for k, v := range headers {
		writeBinary(uint16(len(k)))
		writeBinary([]byte(k))
		writeBinary(uint16(len(v)))
		writeBinary([]byte(v))
	}
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
