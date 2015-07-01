package thrift

import (
	"bytes"
	"io/ioutil"
	"testing"

	"github.com/stretchr/testify/assert"
)

var headers = map[string]string{
	"header1": "value1",
	"header2": "value2",
	"header3": "value1",
	"header4": "value2",
	"header5": "value1",
	"header6": "value2",
	"header7": "value1",
	"header8": "value2",
	"header9": "value1",
	"header0": "value2",
}

func BenchmarkWriteHeaders(b *testing.B) {
	for i := 0; i < b.N; i++ {
		writeHeaders(ioutil.Discard, headers)
	}
}

func BenchmarkReadHeaders(b *testing.B) {
	buf := &bytes.Buffer{}
	assert.NoError(b, writeHeaders(buf, headers))
	bs := buf.Bytes()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		reader := bytes.NewReader(bs)
		readHeaders(reader)
	}
}
