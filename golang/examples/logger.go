package examples

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
