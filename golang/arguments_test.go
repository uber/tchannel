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
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
	"testing/iotest"
)

type testObject struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

func TestStreamingInputOutput(t *testing.T) {
	b := []byte("This is a pseudo-streamed value")
	r := iotest.OneByteReader(bytes.NewReader(b))

	var buffer bytes.Buffer
	var w bytes.Buffer

	require.Nil(t, NewStreamingOutput(r).WriteTo(&buffer))
	require.Nil(t, NewStreamingInput(&w).ReadFrom(&buffer))
	assert.Equal(t, b, w.Bytes())
}

func TestJSONInputOutput(t *testing.T) {
	obj := testObject{Name: "Foo", Value: 20756}

	var buffer bytes.Buffer
	require.Nil(t, NewJSONOutput(obj).WriteTo(&buffer))
	assert.Equal(t, "{\"name\":\"Foo\",\"value\":20756}", buffer.String())

	outObj := testObject{}
	require.Nil(t, NewJSONInput(&outObj).ReadFrom(&buffer))
	assert.Equal(t, "Foo", outObj.Name)
	assert.Equal(t, 20756, outObj.Value)
}
