package examples

import (
	log "github.com/Sirupsen/logrus"
)

// LogrusLogger implements a tchannel.Logger on tope of logrus
type LogrusLogger struct{}

func (l LogrusLogger) Errorf(msg string, args ...interface{}) { log.Errorf(msg, args...) }
func (l LogrusLogger) Warnf(msg string, args ...interface{})  { log.Warnf(msg, args...) }
func (l LogrusLogger) Infof(msg string, args ...interface{})  { log.Infof(msg, args...) }
func (l LogrusLogger) Debugf(msg string, args ...interface{}) { log.Debugf(msg, args...) }
