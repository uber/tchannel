package typed

import (
	"bytes"
)

func CombineBuffers(elements ...[][]byte) [][]byte {
	var buffers [][]byte
	for i := range elements {
		buffers = append(buffers, bytes.Join(elements[i], []byte{}))
	}

	return buffers
}
