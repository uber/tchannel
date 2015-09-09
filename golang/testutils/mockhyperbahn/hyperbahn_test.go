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

package mockhyperbahn_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
	"github.com/uber/tchannel/golang/hyperbahn"
	"github.com/uber/tchannel/golang/testutils/mockhyperbahn"
)

var config = struct {
	hyperbahnConfig hyperbahn.Configuration
}{}

// setupServer is the application code we are attempting to test.
func setupServer() error {
	ch, err := tchannel.NewChannel("myservice", nil)
	if err != nil {
		return err
	}

	if err := ch.ListenAndServe("127.0.0.1:0"); err != nil {
		return err
	}

	client, err := hyperbahn.NewClient(ch, config.hyperbahnConfig, nil)
	if err != nil {
		return err
	}

	return client.Advertise()
}

func TestMockHyperbahn(t *testing.T) {
	mh, err := mockhyperbahn.New()
	require.NoError(t, err, "mock hyperbahn failed")
	defer mh.Close()

	config.hyperbahnConfig = mh.Configuration()
	require.NoError(t, setupServer(), "setupServer failed")
	assert.Equal(t, []string{"myservice"}, mh.GetAdvertised())
}
