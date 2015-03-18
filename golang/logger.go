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

// Logger provides an abstract interface for logging from TChannel.  Applications
// can use whatever logging library they prefer as long as they implement this
// interface
type Logger interface {
	// Errorf logs a message at error priority
	Errorf(msg string, args ...interface{})

	// Warnf logs a message at warning priority
	Warnf(msg string, args ...interface{})

	// Infof logs a message at info priority
	Infof(msg string, args ...interface{})

	// Debugf logs a message at debug priority
	Debugf(msg string, args ...interface{})
}

// NullLogger is a logger that emits nowhere
type NullLogger struct{}

// Errorf logs a message at error priority
func (l NullLogger) Errorf(msg string, args ...interface{}) {}

// Warnf logs a message at warning priority
func (l NullLogger) Warnf(msg string, args ...interface{}) {}

// Infof logs a message at info priority
func (l NullLogger) Infof(msg string, args ...interface{}) {}

// Debugf logs a message at debug priority
func (l NullLogger) Debugf(msg string, args ...interface{}) {}
