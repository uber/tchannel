package tchannel

import (
	"fmt"
	"io"
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

	// Fields returns the fields that this logger contains.
	Fields() LogFields

	// WithField returns a logger with the current logger's fields and newField.
	WithField(newField LogField) Logger

	// WithFields returns a logger with the current logger's fields and newFields.
	WithFields(newFields LogFields) Logger
}

// LogField is a single field of additional information passed to the logger.
type LogField struct {
	Key   string
	Value interface{}
}

// LogFields is a list of LogFields used to pass additional information to the logger.
type LogFields []LogField

// NullLogger is a logger that emits nowhere
var NullLogger Logger = nullLogger{}

type nullLogger struct{}

func (nullLogger) Fatalf(msg string, arg ...interface{})  { os.Exit(1) }
func (nullLogger) Errorf(msg string, args ...interface{}) {}
func (nullLogger) Warnf(msg string, args ...interface{})  {}
func (nullLogger) Infof(msg string, args ...interface{})  {}
func (nullLogger) Debugf(msg string, args ...interface{}) {}
func (nullLogger) Fields() LogFields                      { return nil }

func (l nullLogger) WithFields(_ LogFields) Logger { return l }
func (l nullLogger) WithField(_ LogField) Logger   { return l }

// SimpleLogger prints logging information to standard out.
var SimpleLogger = NewLogger(os.Stdout)

type writerLogger struct {
	writer io.Writer
	fields LogFields
}

const (
	writerLoggerStamp = "2006-01-02 15:04:05"
)

// NewLogger returns a Logger that writes to the given writer.
func NewLogger(writer io.Writer, fields ...LogField) Logger {
	return &writerLogger{writer, fields}
}

func (l writerLogger) Fatalf(msg string, args ...interface{}) {
	l.printfn("F", msg, args...)
	os.Exit(1)
}

func (l writerLogger) Errorf(msg string, args ...interface{}) { l.printfn("E", msg, args...) }
func (l writerLogger) Warnf(msg string, args ...interface{})  { l.printfn("W", msg, args...) }
func (l writerLogger) Infof(msg string, args ...interface{})  { l.printfn("I", msg, args...) }
func (l writerLogger) Debugf(msg string, args ...interface{}) { l.printfn("D", msg, args...) }
func (l writerLogger) printfn(prefix, msg string, args ...interface{}) {
	fmt.Fprintf(l.writer, "%s [%s] %s tags: %v\n", time.Now().Format(writerLoggerStamp), prefix, fmt.Sprintf(msg, args...), l.fields)
}

func (l writerLogger) Fields() LogFields {
	return l.fields
}

func (l writerLogger) WithField(newField LogField) Logger {
	existingFields := l.Fields()
	fields := make(LogFields, 0, len(existingFields)+1)
	fields = append(fields, existingFields...)
	fields = append(fields, newField)
	return writerLogger{l.writer, fields}
}

func (l writerLogger) WithFields(newFields LogFields) Logger {
	existingFields := l.Fields()
	fields := make(LogFields, 0, len(existingFields)+1)
	fields = append(fields, existingFields...)
	fields = append(fields, newFields...)
	return writerLogger{l.writer, fields}
}

// LogLevel is the level of logging used by LevelLogger.
type LogLevel int

// The minimum level that will be logged. e.g. LogLevelError only logs errors and fatals.
const (
	LogLevelAll LogLevel = iota
	LogLevelDebug
	LogLevelInfo
	LogLevelWarn
	LogLevelError
	LogLevelFatal
)

type levelLogger struct {
	logger Logger
	level  LogLevel
}

// NewLevelLogger returns a logger that only logs messages with a minimum of level.
func NewLevelLogger(logger Logger, level LogLevel) Logger {
	return levelLogger{logger, level}
}

func (l levelLogger) Fatalf(msg string, args ...interface{}) {
	if l.level <= LogLevelFatal {
		l.logger.Fatalf(msg, args...)
	}
}

func (l levelLogger) Errorf(msg string, args ...interface{}) {
	if l.level <= LogLevelError {
		l.logger.Errorf(msg, args...)
	}
}

func (l levelLogger) Warnf(msg string, args ...interface{}) {
	if l.level <= LogLevelWarn {
		l.logger.Warnf(msg, args...)
	}
}

func (l levelLogger) Infof(msg string, args ...interface{}) {
	if l.level <= LogLevelInfo {
		l.logger.Infof(msg, args...)
	}
}

func (l levelLogger) Debugf(msg string, args ...interface{}) {
	if l.level <= LogLevelDebug {
		l.logger.Debugf(msg, args...)
	}
}

func (l levelLogger) Fields() LogFields {
	return l.logger.Fields()
}

func (l levelLogger) WithField(field LogField) Logger {
	return levelLogger{
		logger: l.logger.WithField(field),
		level:  l.level,
	}
}

func (l levelLogger) WithFields(fields LogFields) Logger {
	return levelLogger{
		logger: l.logger.WithFields(fields),
		level:  l.level,
	}
}
