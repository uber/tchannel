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
	"sync"
	"time"
)

// NowStub replaces a function variable to time.Now with a function that
// allows the return values to be controller by the caller.
// The rerturned function is used to control the increment amount between calls.
func NowStub(funcVar *func() time.Time, initial time.Time) func(time.Duration) {
	var mut sync.Mutex
	cur := initial
	var addAmt time.Duration
	*funcVar = func() time.Time {
		mut.Lock()
		defer mut.Unlock()
		cur = cur.Add(addAmt)
		return cur
	}
	return func(d time.Duration) {
		addAmt = d
	}
}

// ResetNowStub resets a Now stub.
func ResetNowStub(funcVar *func() time.Time) {
	*funcVar = time.Now
}
