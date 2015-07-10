package testutils

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
	"fmt"
	"runtime"
	"strings"
	"testing"
	"time"
)

// getCallerName returns the test name that called this function.
// It traverses the stack to find the function name directly after a testing.* call.
func getCallerName() string {
	pc := make([]uintptr, 10)
	n := runtime.Callers(2, pc)
	for i := n; i > 0; i-- {
		fname := runtime.FuncForPC(pc[i-1]).Name()
		if strings.HasPrefix(fname, "testing.") {
			return runtime.FuncForPC(pc[i-2]).Name()
		}
	}
	return "unknown"
}

// SetTimeout is used to fail tests after a timeout. It returns a function that should be
// run once the test is complete. The standard way is to use defer, e.g.
// defer SetTimeout(t, time.Second)()
func SetTimeout(t *testing.T, timeout time.Duration) func() {
	caller := getCallerName()
	c := make(chan struct{})

	go func() {
		select {
		case <-c:
			// Test is complete, don't need to do anything.
		case <-time.After(timeout):
			t.Logf("Test %s timed out after %v", caller, timeout)
			// Unfortunately, tests cannot be failed from new goroutines, so use a panic.
			panic(fmt.Errorf("Test %s timed out after %v", caller, timeout))
		}
	}()

	return func() {
		c <- struct{}{}
	}
}
