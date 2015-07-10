package tchannel_test

import (
	"testing"
	"time"

	. "github.com/uber/tchannel/golang"

	"github.com/stretchr/testify/assert"
	"golang.org/x/net/context"
)

type mockIncomingCall struct {
	callerName string
}

func (mic *mockIncomingCall) CallerName() string {
	return mic.callerName
}

var (
	cn   = "hello"
	key1 = "foo"
	key2 = "bar"
)

func TestCurrentCallWithMatchingKey(t *testing.T) {
	expected := mockIncomingCall{callerName: cn}
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, key1, &expected)

	actual := CurrentCallWithKey(ctx, key1)

	assert.Equal(t, &expected, actual)
}

func TestCurrentCallWithoutMatchingKey(t *testing.T) {
	expected := mockIncomingCall{callerName: cn}
	ctx, cancel := NewContext(time.Second)
	defer cancel()
	ctx = context.WithValue(ctx, key1, &expected)

	assert.Nil(t, CurrentCallWithKey(ctx, key2))
}
