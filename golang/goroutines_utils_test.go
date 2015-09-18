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
	"fmt"
	"io"
	"runtime"
	"strconv"
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

// parseGoStackHeader parses a stack header that looks like:
// goroutine 643 [runnable]:
// And returns the goroutine ID, and the state.
func parseGoStackHeader(line string) (goroutineID int, state string) {
	parts := strings.SplitN(line, " ", 3)
	if len(parts) != 3 {
		panic(fmt.Sprintf("unexpected stack header format: %v", line))
	}

	id, err := strconv.Atoi(parts[1])
	if err != nil {
		panic(fmt.Sprintf("failed to parse goroutine ID: %v", parts[1]))
	}

	state = strings.TrimSuffix(strings.TrimPrefix(parts[2], "["), "]")
	return id, state
}

type goroutineStack struct {
	id        int
	fullStack *bytes.Buffer
	goState   string
}

func getAllStacks() []goroutineStack {
	var stacks []goroutineStack

	var curStack *goroutineStack
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
			// flush any previous stack
			if curStack != nil {
				stacks = append(stacks, *curStack)
			}
			id, goState := parseGoStackHeader(line)
			curStack = &goroutineStack{
				id:        id,
				goState:   goState,
				fullStack: &bytes.Buffer{},
			}
		}
		curStack.fullStack.WriteString(line)
	}

	if curStack != nil {
		stacks = append(stacks, *curStack)
	}
	return stacks
}

// isLeak returns whether the given stack contains a stack frame that is considered a leak.
func (s goroutineStack) isLeak() bool {
	isLeakLine := func(line string) bool {
		return strings.Contains(line, "(*Channel).Serve") ||
			strings.Contains(line, "(*Connection).readFrames") ||
			strings.Contains(line, "(*Connection).writeFrames")
	}

	for {
		s.fullStack.Reset()
		line, err := s.fullStack.ReadString('\n')
		if err == io.EOF {
			return false
		}
		if err != nil {
			panic(err)
		}

		if isLeakLine(line) {
			return true
		}
	}
}

func getLeakStacks(stacks []goroutineStack) []goroutineStack {
	var leakStacks []goroutineStack
	for _, s := range stacks {
		if s.isLeak() {
			leakStacks = append(leakStacks, s)
		}
	}
	return leakStacks
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
		// Ignore the first stack which is the current goroutine.
		stacks := getAllStacks()[1:]
		for _, stack := range stacks {
			if _, ok := retryStates[stack.goState]; ok {
				runtime.Gosched()
				if i > maxAttempts/2 {
					time.Sleep(time.Millisecond)
				}
				continue retry
			}
		}

		// There are no running/runnable goroutines, so check for bad leaks.
		leakStacks := getLeakStacks(stacks)
		for _, v := range leakStacks {
			t.Errorf("Found leaked goroutine in state %q Full stack:\n%s\n",
				v.goState, v.fullStack.String())
		}
		return
	}

	t.Errorf("VerifyNoBlockedGoroutines failed: too many retries")
}
