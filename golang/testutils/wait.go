package testutils

import (
	"sync"
	"time"
)

// WaitFor will retry f till it returns true for a maximum of timeout.
// It returns true if f returned true, false if timeout was hit.
func WaitFor(timeout time.Duration, f func() bool) bool {
	timeoutEnd := time.Now().Add(timeout)

	const maxSleep = time.Millisecond * 50
	sleepFor := time.Millisecond
	for {
		if f() {
			return true
		}

		if time.Now().After(timeoutEnd) {
			return false
		}

		time.Sleep(sleepFor)
		if sleepFor < maxSleep {
			sleepFor *= 2
		}
	}
}

// WaitWG waits for the given WaitGroup to be complete with a timeout
// and returns whether the WaitGroup completed within the timeout.
func WaitWG(wg *sync.WaitGroup, timeout time.Duration) bool {
	wgC := make(chan struct{})

	go func() {
		wg.Wait()
		wgC <- struct{}{}
	}()
	select {
	case <-time.After(timeout):
		return false
	case <-wgC:
		return true
	}
}
