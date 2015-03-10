package tchannel

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

func (p defaultFramePool) Get() *Frame      { return &Frame{} }
func (p defaultFramePool) Release(f *Frame) {}
