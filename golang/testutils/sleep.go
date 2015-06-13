package testutils

import "time"

// SleepStub returns a function that can be used to stub time.Sleep, as well
// as two channels to control the sleep stub:
// .<-chan time.Duration which will contain arguments that the stub was called with.
// chan<- struct{} that should be written to when you want the Sleep to return.
func SleepStub(funcVar *func(time.Duration)) (<-chan time.Duration, chan<- struct{}) {
	args := make(chan time.Duration)
	block := make(chan struct{})
	*funcVar = func(t time.Duration) {
		args <- t
		<-block
	}
	return args, block
}

// ResetSleepStub resets a Sleep stub.
func ResetSleepStub(funcVar *func(time.Duration)) {
	*funcVar = time.Sleep
}
