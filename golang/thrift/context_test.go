package thrift

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/uber/tchannel/golang/testutils"
)

var (
	cn = "hello"
)

func TestWrapContextForTest(t *testing.T) {
	call := testutils.CreateIncomingCall(cn)
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	actual := WrapContextForTest(ctx, call)
	assert.NotNil(t, actual, "Should not return nil.")
}
