package thrift

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestWrapContext(t *testing.T) {
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	actual := Wrap(ctx)
	assert.NotNil(t, actual, "Should not return nil.")
}
