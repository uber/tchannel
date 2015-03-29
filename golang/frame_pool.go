package tchannel

import (
	"fmt"
	"runtime"
	"sync"
)

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

// A FramePool is a pool for managing and re-using frames
type FramePool interface {
	// Retrieves a new frame from the pool
	Get() *Frame

	// Releases a frame back to the pool
	Release(f *Frame)
}

// The DefaultFramePool uses the heap as the pool
var DefaultFramePool = defaultFramePool{}

type defaultFramePool struct{}

func (p defaultFramePool) Get() *Frame      { return NewFrame(MaxFramePayloadSize) }
func (p defaultFramePool) Release(f *Frame) {}

// An ErrorDetectingFramePool is a FramePool that can detect when a frame is double released or leaked.
// Do not use this FramePool in production.
type ErrorDetectingFramePool struct {
	mut   sync.Mutex
	inUse []*trackedFrame
}

// Get retrieves a frame from the pool
func (p *ErrorDetectingFramePool) Get() *Frame {
	p.mut.Lock()
	defer p.mut.Unlock()

	frame := NewFrame(MaxFramePayloadSize)
	p.inUse = append(p.inUse, p.track(frame))
	return frame
}

// Release releases a frame back to the pool
func (p *ErrorDetectingFramePool) Release(f *Frame) {
	p.mut.Lock()
	defer p.mut.Unlock()

	for i := range p.inUse {
		if f != p.inUse[i].frame {
			continue
		}

		p.inUse = append(p.inUse[:i], p.inUse[i+1:]...)
		return
	}

	panic(fmt.Sprintf("attempted release of unpooled or already released frame %s", f.Header))
}

func (p *ErrorDetectingFramePool) track(frame *Frame) *trackedFrame {
	trackedFrame := &trackedFrame{
		allocatedAt: make([]byte, 1024),
		frame:       frame,
	}
	runtime.Stack(trackedFrame.allocatedAt, false)
	return trackedFrame
}

// ReportLeaks reports any leaked frames
func (p *ErrorDetectingFramePool) ReportLeaks(includeStack bool) bool {
	p.mut.Lock()
	defer p.mut.Unlock()

	if len(p.inUse) == 0 {
		return false
	}

	for _, frame := range p.inUse {
		fmt.Printf("Leaked frame (%p), %s\n", frame.frame, frame)
		if includeStack {
			fmt.Printf("Allocated at %s", frame.allocatedAt)
		}
	}

	return true
}

// A trackedFrame contains tracking information about an allocated frame
type trackedFrame struct {
	allocatedAt []byte
	frame       *Frame
}

func (f *trackedFrame) String() string { return f.frame.Header.String() }
