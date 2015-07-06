package tchannel

import (
	"fmt"
	"runtime"
	"strings"
	"sync"
)

type RecordingFramePool struct {
	mut         sync.Mutex
	allocations map[*Frame]string
	badRelease  []string
}

func NewRecordingFramePool() *RecordingFramePool {
	return &RecordingFramePool{
		allocations: make(map[*Frame]string),
	}
}

func CheckEmptyExchanges(c *Connection) string {
	if exchangesLeft := len(c.outbound.exchanges) + len(c.inbound.exchanges); exchangesLeft > 0 {
		return fmt.Sprintf("connection %p had %v leftover exchanges", c, exchangesLeft)
	}
	return ""
}

func recordStack() string {
	buf := make([]byte, 4096)
	runtime.Stack(buf, false)
	return string(buf)
}

func (p *RecordingFramePool) Get() *Frame {
	p.mut.Lock()
	defer p.mut.Unlock()
	frame := NewFrame(MaxFramePayloadSize)
	p.allocations[frame] = recordStack()
	return frame
}

func zeroOut(bs []byte) {
	for i := range bs {
		bs[i] = 0
	}
}

func (p *RecordingFramePool) Release(f *Frame) {
	// Make sure the payload is not used after this point by clearing the frame.
	zeroOut(f.Payload)
	f.Payload = nil
	zeroOut(f.buffer)
	f.buffer = nil
	zeroOut(f.headerBuffer)
	f.headerBuffer = nil
	f.Header = FrameHeader{}

	p.mut.Lock()
	defer p.mut.Unlock()

	if _, ok := p.allocations[f]; !ok {
		p.badRelease = append(p.badRelease, "bad Release at "+recordStack())
		return
	}

	delete(p.allocations, f)
}

func (p *RecordingFramePool) CheckEmpty() (int, string) {
	p.mut.Lock()
	defer p.mut.Unlock()

	var badCalls []string
	badCalls = append(badCalls, p.badRelease...)
	for f, s := range p.allocations {
		badCalls = append(badCalls, fmt.Sprintf("frame %p: %v not released, get from: %v", f, f.Header, s))
	}
	return len(p.allocations), strings.Join(badCalls, "\n")
}
