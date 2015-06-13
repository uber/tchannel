package testutils

import (
	"testing"
	"time"
)

// SetTimeout is used to fail tests after a timeout.
// This should be used in tests which may block forever (e.g. due to channels).
func SetTimeout(t *testing.T, timeout time.Duration) {
	go func() {
		time.Sleep(timeout)
		t.Logf("Test timed out after " + timeout.String())
		// Unfortunately, tests cannot be failed from new goroutines, so use a panic.
		panic("Test timed out after " + timeout.String())
	}()
}
