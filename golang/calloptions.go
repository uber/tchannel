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

// Format is the arg scheme used for a specific call.
type Format string

// The list of formats supported by tchannel.
const (
	HTTP   Format = "http"
	JSON   Format = "json"
	Raw    Format = "raw"
	Thrift Format = "thrift"
)

func (f Format) String() string {
	return string(f)
}

// CallOptions are options for a specific call.
type CallOptions struct {
	// Format is arg scheme used for this call, sent in the "as" header.
	// This header is only set if the Format is set.
	Format Format
}

var defaultCallOptions = &CallOptions{}

func (c *CallOptions) setHeaders(headers callHeaders) {
	if c == nil {
		c = defaultCallOptions
	}

	format := Raw
	if c.Format != "" {
		format = c.Format
	}

	headers[ArgScheme] = format.String()
}
