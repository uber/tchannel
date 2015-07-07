package tchannel

import (
	"math/rand"
	"sync"
)

// lockedSource allows a random number generator to be used by multiple goroutines concurrently.
// The code is very similar to math/rand.lockedSource, which is unfortunately not exposed.
type lockedSource struct {
	mut sync.Mutex
	src rand.Source
}

// NewRand returns a rand.Rand that is threadsafe.
func NewRand(seed int64) *rand.Rand {
	return rand.New(&lockedSource{src: rand.NewSource(seed)})
}

func (r *lockedSource) Int63() (n int64) {
	r.mut.Lock()
	n = r.src.Int63()
	r.mut.Unlock()
	return
}

func (r *lockedSource) Seed(seed int64) {
	r.mut.Lock()
	r.src.Seed(seed)
	r.mut.Unlock()
}
