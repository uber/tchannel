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

package tchannel_test

import (
	"bufio"
	"bytes"
	"io"
	"runtime"
	"strings"
	"testing"
	"time"
)

func getStacks() []byte {
	for i := 4096; ; i *= 2 {
		buf := make([]byte, i)
		if n := runtime.Stack(buf, true /* all */); n < i {
			return buf
		}
	}
}

type goroutineStack struct {
	leakLine  string
	fullStack []string
	goState   string
}

func parseGoState(line string) string {
	// parse state from 'goroutine 10 [syscall]:'
	i1 := strings.Index(line, "[")
	i2 := strings.Index(line, "]")
	if i1 < 0 || i2 < 0 {
		return ""
	}
	return line[i1+1 : i2]
}

func getMatchingGoStacks() []goroutineStack {
	badMatches := []string{
		"(*Channel).Serve",
		"(*Connection).readFrames",
		"(*Connection).writeFrames",
	}

	var matching []goroutineStack
	var curStack []string
	var goState string
	stackReader := bufio.NewReader(bytes.NewReader(getStacks()))
	for {
		line, err := stackReader.ReadString('\n')
		if err == io.EOF {
			break
		}
		if err != nil {
			panic("stack reader failed")
		}

		// If we see the goroutine header, start a new stack.
		if strings.HasPrefix(line, "goroutine ") {
			curStack = nil
			goState = parseGoState(line)
		}
		curStack = append(curStack, line)

		// If the line matches any of our badMatches, log it.
		for _, m := range badMatches {
			if strings.Contains(line, m) {
				matching = append(matching, goroutineStack{
					leakLine:  line,
					fullStack: curStack,
					goState:   goState,
				})
			}
		}
	}

	return matching
}

// VerifyNoBlockedGoroutines verifies that there are no goroutines in the global space
// that are stuck inside of readFrames or writeFrames.
// Since some goroutines may still be performing work in the background, we retry the
// checks if any goroutines are fine in a running state a finite number of times.
func VerifyNoBlockedGoroutines(t *testing.T) {
	retryStates := map[string]struct{}{
		"runnable": struct{}{},
		"running":  struct{}{},
		"syscall":  struct{}{},
	}
	const maxAttempts = 10

retry:
	for i := 0; i < maxAttempts; i++ {
		runtime.Gosched()
		if i > maxAttempts/2 {
			time.Sleep(time.Millisecond)
		}

		matching := getMatchingGoStacks()
		for _, v := range matching {
			if _, ok := retryStates[v.goState]; ok {
				continue retry
			}
		}

		for _, v := range matching {
			t.Errorf("Found leaked goroutine in state %q, leakLine:\n  %s  Full stack:\n%s",
				v.goState, v.leakLine, strings.Join(v.fullStack, ""))
		}
		return
	}

	t.Errorf("VerifyNoBlockedGoroutines failed: too many retries")
}
