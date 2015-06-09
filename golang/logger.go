package tchannel

import (
	"fmt"
	"time"
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

import (
	"os"
)

// Logger provides an abstract interface for logging from TChannel.
// Applications can provide their own implementation of this interface to adapt
// TChannel logging to whatever logging library they prefer (stdlib log,
// logrus, go-logging, etc).  The SimpleLogger adapts to the standard go log
// package.
type Logger interface {
	// Fatalf logs a message, then exits with os.Exit(1)
	Fatalf(msg string, args ...interface{})

	// Errorf logs a message at error priority
	Errorf(msg string, args ...interface{})

	// Warnf logs a message at warning priority
	Warnf(msg string, args ...interface{})

	// Infof logs a message at info priority
	Infof(msg string, args ...interface{})

	// Debugf logs a message at debug priority
	Debugf(msg string, args ...interface{})
}

type prefixLogger struct {
	prefix string
	logger Logger
}

// PrefixLogger returns a Logger that prefixes all logged messages with the given prefix.
func PrefixedLogger(prefix string, logger Logger) Logger {
	// Avoid layers of indirect calls when wrapping another prefixLogger.
	if pl, ok := logger.(*prefixLogger); ok {
		prefix = prefix + pl.prefix
		logger = pl.logger
	}
	return &prefixLogger{prefix, logger}
}

func (l *prefixLogger) Fatalf(msg string, args ...interface{}) {
	l.logger.Fatalf(l.prefix+msg, args...)
}

func (l *prefixLogger) Errorf(msg string, args ...interface{}) {
	l.logger.Errorf(l.prefix+msg, args...)
}

func (l *prefixLogger) Warnf(msg string, args ...interface{}) {
	l.logger.Warnf(l.prefix+msg, args...)
}

func (l *prefixLogger) Infof(msg string, args ...interface{}) {
	l.logger.Infof(l.prefix+msg, args...)
}

func (l *prefixLogger) Debugf(msg string, args ...interface{}) {
	l.logger.Debugf(l.prefix+msg, args...)
}

// NullLogger is a logger that emits nowhere
var NullLogger Logger = nullLogger{}

type nullLogger struct{}

func (l nullLogger) Fatalf(msg string, arg ...interface{})  { os.Exit(1) }
func (l nullLogger) Errorf(msg string, args ...interface{}) {}
func (l nullLogger) Warnf(msg string, args ...interface{})  {}
func (l nullLogger) Infof(msg string, args ...interface{})  {}
func (l nullLogger) Debugf(msg string, args ...interface{}) {}

// SimpleLogger prints logging information to the console
var SimpleLogger Logger = simpleLogger{}

type simpleLogger struct{}

const (
	simpleLoggerStamp = "2006-01-02 15:04:05"
)

func (l simpleLogger) Fatalf(msg string, args ...interface{}) {
	l.printfn("F", msg, args...)
	os.Exit(1)
}

func (l simpleLogger) Errorf(msg string, args ...interface{}) { l.printfn("E", msg, args...) }
func (l simpleLogger) Warnf(msg string, args ...interface{})  { l.printfn("W", msg, args...) }
func (l simpleLogger) Infof(msg string, args ...interface{})  { l.printfn("I", msg, args...) }
func (l simpleLogger) Debugf(msg string, args ...interface{}) { l.printfn("D", msg, args...) }
func (l simpleLogger) printfn(prefix, msg string, args ...interface{}) {
	fmt.Printf("%s [%s] %s\n", time.Now().Format(simpleLoggerStamp), prefix, fmt.Sprintf(msg, args...))
}
