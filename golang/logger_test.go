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

package tchannel_test

import (
	"bytes"
	"testing"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/assert"
)

func TestWriterLogger(t *testing.T) {
	var buf bytes.Buffer
	var bufLogger = NewLogger(&buf)

	debugf := func(logger Logger, msg string, args ...interface{}) { logger.Debugf(msg, args...) }
	infof := func(logger Logger, msg string, args ...interface{}) { logger.Infof(msg, args...) }
	warnf := func(logger Logger, msg string, args ...interface{}) { logger.Warnf(msg, args...) }
	errorf := func(logger Logger, msg string, args ...interface{}) { logger.Errorf(msg, args...) }

	levels := []struct {
		levelFunc   func(logger Logger, msg string, args ...interface{})
		levelPrefix string
	}{
		{debugf, "D"},
		{infof, "I"},
		{warnf, "W"},
		{errorf, "E"},
	}

	for _, level := range levels {
		tagLogger1 := bufLogger.WithFields(LogField{"key1", "value1"})
		tagLogger2 := bufLogger.WithFields(LogField{"key2", "value2"}, LogField{"key3", "value3"})

		verifyMsgAndPrefix := func(logger Logger) {
			buf.Reset()
			level.levelFunc(logger, "mes%v", "sage")

			out := buf.String()
			assert.Contains(t, out, "message")
			assert.Contains(t, out, "["+level.levelPrefix+"]")
		}

		verifyMsgAndPrefix(bufLogger)

		verifyMsgAndPrefix(tagLogger1)
		assert.Contains(t, buf.String(), "{key1 value1}")
		assert.NotContains(t, buf.String(), "{key2 value2}")
		assert.NotContains(t, buf.String(), "{key3 value3}")

		verifyMsgAndPrefix(tagLogger2)
		assert.Contains(t, buf.String(), "{key2 value2}")
		assert.Contains(t, buf.String(), "{key3 value3}")
		assert.NotContains(t, buf.String(), "{key1 value1}")
	}
}

func TestLevelLogger(t *testing.T) {
	var buf bytes.Buffer
	var bufLogger = NewLogger(&buf)

	expectedLines := 0
	for level := LogLevelFatal; level >= LogLevelAll; level-- {
		buf.Reset()
		levelLogger := NewLevelLogger(bufLogger, level)

		levelLogger.Debugf("debug")
		levelLogger.Infof("info")
		levelLogger.Warnf("warn")
		levelLogger.Errorf("error")

		assert.Equal(t, expectedLines, bytes.Count(buf.Bytes(), []byte{'\n'}))
		if expectedLines < 4 {
			expectedLines++
		}
	}
}
