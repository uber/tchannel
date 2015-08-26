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

package hyperbahn

import (
	"fmt"
	"math/rand"
	"time"
)

const (
	// maxAdvertiseFailures is the number of consecutive advertise failures after
	// which we give up and trigger an OnError event.
	maxAdvertiseFailures = 5
	// advertiseInterval is the base time interval between advertisements.
	advertiseInterval = 50 * time.Second
	// advertiseFuzzInterval is the maximum fuzz period to add to advertiseInterval.
	advertiseFuzzInterval = 20 * time.Second
	// advertiseRetryInterval is the unfuzzed base duration to wait before retry on the first
	// advertise failure. Successive retries will use 2 * previous base duration.
	advertiseRetryInterval = 1 * time.Second
)

// timeSleep is a variable for stubbing in unit tests.
var timeSleep = time.Sleep

// ErrAdvertiseFailed is triggered when advertise fails.
type ErrAdvertiseFailed struct {
	// WillRetry is set to true if advertise will be retried.
	WillRetry bool
	// Cause is the underlying error returned from the advertise call.
	Cause error
}

func (e ErrAdvertiseFailed) Error() string {
	return fmt.Sprintf("advertise failed, retry: %v, cause: %v", e.WillRetry, e.Cause)
}

// fuzzInterval returns a fuzzed version of the interval based on FullJitter as described here:
// http://www.awsarchitectureblog.com/2015/03/backoff.html
func fuzzInterval(interval time.Duration) time.Duration {
	return time.Duration(rand.Int63n(int64(interval)))
}

// fuzzedAdvertiseInterval returns the time to sleep between successful advertisements.
func (c *Client) fuzzedAdvertiseInterval() time.Duration {
	return advertiseInterval + fuzzInterval(advertiseFuzzInterval)
}

// advertiseLoop readvertises the service approximately every minute (with some fuzzing).
func (c *Client) advertiseLoop() {
	sleepFor := c.fuzzedAdvertiseInterval()
	consecutiveFailures := uint8(0)

	for {
		timeSleep(sleepFor)

		if err := c.sendAdvertise(); err != nil {
			consecutiveFailures++
			if consecutiveFailures >= maxAdvertiseFailures {
				c.opts.Handler.OnError(ErrAdvertiseFailed{Cause: err, WillRetry: false})
				if c.opts.FailStrategy == FailStrategyFatal {
					c.tchan.Logger().Fatalf("Hyperbahn client registration failed: %v", err)
				}
				return
			}
			c.opts.Handler.OnError(ErrAdvertiseFailed{Cause: err, WillRetry: true})
			sleepFor = fuzzInterval(advertiseRetryInterval * time.Duration(1<<consecutiveFailures))
		} else {
			c.opts.Handler.On(Readvertised)
			sleepFor = c.fuzzedAdvertiseInterval()
			consecutiveFailures = 0
		}
	}
}
