package tchannel

// Pool for managing and re-using frames
type FramePool interface {
	// Retrieves a new frame from the pool
	Get() *Frame

	// Releases a frame back to the pool
	Release(f *Frame)
}

// The DefaultFramePool uses the heap as the pool
type DefaultFramePool struct{}

func (p DefaultFramePool) Get() *Frame      { return &Frame{} }
func (p DefaultFramePool) Release(f *Frame) {}
