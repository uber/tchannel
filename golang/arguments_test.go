package tchannel

import (
	"bytes"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

type testObject struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

func TestJSONInputOutput(t *testing.T) {
	obj := testObject{Name: "Foo", Value: 20756}

	var buffer bytes.Buffer
	require.Nil(t, NewJSONOutput(obj).WriteTo(&buffer))
	assert.Equal(t, "{\"name\":\"Foo\",\"value\":20756}", buffer.String())

	outObj := testObject{}
	require.Nil(t, NewJSONInput(&outObj).ReadFrom(&buffer))
	assert.Equal(t, "Foo", outObj.Name)
	assert.Equal(t, 20756, outObj.Value)
}
