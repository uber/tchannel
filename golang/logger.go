package tchannel

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
