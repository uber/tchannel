package tchannel

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"golang.org/x/net/context"
)

type dummyHandler struct{}

func (dummyHandler) Handle(ctx context.Context, call *InboundCall) {}

func TestHandlers(t *testing.T) {
	const (
		s1 = "s1"
		s2 = "s2"
		m1 = "m1"
		m2 = "m2"
	)
	var (
		hmap = &handlerMap{}

		h1 = &dummyHandler{}
		h2 = &dummyHandler{}

		m1b = []byte(m1)
		m2b = []byte(m2)
	)

	assert.Nil(t, hmap.find(s1, m1b))
	assert.Nil(t, hmap.find(s2, m1b))
	assert.Nil(t, hmap.find(s1, m2b))

	hmap.register(h1, s1, m1)
	assert.Equal(t, h1, hmap.find(s1, m1b))
	assert.Nil(t, hmap.find(s2, m1b))
	assert.Nil(t, hmap.find(s1, m2b))

	hmap.register(h2, s2, m1)
	assert.Equal(t, h1, hmap.find(s1, m1b))
	assert.Equal(t, h2, hmap.find(s2, m1b))
	assert.Nil(t, hmap.find(s1, m2b))
}
