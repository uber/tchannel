package examples

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
	"github.com/Sirupsen/logrus"
	"github.com/uber/tchannel/golang"
)

// lgrusLogger implements a tchannel.Logger on top of logrus
type logrusLogger struct {
	log *logrus.Entry
}

var (
	std = NewLogger(logrus.StandardLogger())
)

// StandardLogger returns the standard tchannel Logger
func StandardLogger() tchannel.ContextLogger { return std }

// NewLogger creates a new tchannel Logger around a logrus Logger
func NewLogger(log *logrus.Logger) tchannel.ContextLogger {
	return &logrusLogger{log: logrus.NewEntry(log)}
}

func (l *logrusLogger) Errorf(msg string, args ...interface{}) { l.log.Errorf(msg, args...) }
func (l *logrusLogger) Warnf(msg string, args ...interface{})  { l.log.Warnf(msg, args...) }
func (l *logrusLogger) Infof(msg string, args ...interface{})  { l.log.Infof(msg, args...) }
func (l *logrusLogger) Debugf(msg string, args ...interface{}) { l.log.Debugf(msg, args...) }
func (l *logrusLogger) WithContext(context tchannel.LogContext) tchannel.ContextLogger {
	return &logrusLogger{l.log.WithFields(logrus.Fields(context))}
}
