package tchannel

import (
	log "github.com/Sirupsen/logrus"
)

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

// Logger provides an abstract interface for logging from TChannel.  Applications
// can use whatever logging library they prefer as long as they implement this
// interface
type Logger struct {
	log.Logger
}

var (
	std = &Logger{*log.StandardLogger()}
)

func StandardLogger() *Logger {
	return std
}

func SimpleLogger() *Logger {
	return std
}

func NullLogger() *Logger {
	std.Formatter = new(NullFormatter) // Don't send logs to stdout
	return std
}

type NullFormatter struct{}

// Don't spend time formatting logs
func (*NullFormatter) Format(e *log.Entry) ([]byte, error) {
	return []byte{}, nil
}

// TODO
// Revert to simplistic logs
type SimpleFormatter struct{}

func (f *SimpleFormatter) Format(e *log.Entry) ([]byte, error) {
	return []byte{}, nil
}
