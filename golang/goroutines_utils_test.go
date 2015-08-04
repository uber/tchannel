package tchannel_test

import (
	"bufio"
	"bytes"
	"io"
	"runtime"
	"strings"
	"testing"
)

func getStacks() []byte {
	for i := 4096; ; i *= 2 {
		buf := make([]byte, i)
		if n := runtime.Stack(buf, true /* all */); n < i {
			return buf
		}
	}
}

func VerifyNoBlockedGoroutines(t *testing.T) {
	badMatches := []string{
		"(*Connection).readFrames",
		"(*Connection).writeFrames",
	}

	stackReader := bufio.NewReader(bytes.NewReader(getStacks()))
	for {
		line, err := stackReader.ReadString('\n')
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Errorf("Stack reader failed: %v", err)
		}

		for _, m := range badMatches {
			if strings.Contains(line, m) {
				t.Errorf("Found leaked goroutine, stack line:\n  %s", line)
			}
		}
	}
}
