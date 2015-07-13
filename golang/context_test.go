package tchannel

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

type mockIncomingCall struct {
	callerName string
}

func (m *mockIncomingCall) CallerName() string {
	return m.callerName
}

var (
	cn = "hello"
)

func TestWrapContextForTest(t *testing.T) {
	call := &mockIncomingCall{callerName: cn}
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	actual := WrapContextForTest(ctx, call)
	assert.Equal(t, call, actual.Value(contextKeyCall), "Incorrect call object returned.")
}

func TestCurrentCallWithNilResult(t *testing.T) {
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	call := CurrentCall(ctx)
	assert.Nil(t, call, "Should return nil.")
}
