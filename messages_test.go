package tchannel

import (
	"bytes"
	"code.uber.internal/infra/mmihic/tchannel-go/binio"
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestInitReq(t *testing.T) {
	req := InitReq{
		initMessage{
			id:      0xDEADBEEF,
			Version: 0x02,
			InitParams: InitParams{
				"lang": "en_US",
				"tz":   "GMT",
			},
		},
	}

	assert.Equal(t, uint32(0xDEADBEEF), req.Id(), "ids do not match")
	assert.Equal(t, MessageTypeInitReq, req.Type(), "types do not match")
	assertRoundTrip(t, &req, &InitReq{initMessage{id: 0xDEADBEEF}})
}

func TestInitRes(t *testing.T) {
	res := InitRes{
		initMessage{
			id:      0xDEADBEEF,
			Version: 0x04,
			InitParams: InitParams{
				"lang": "en_US",
				"tz":   "GMT",
			},
		},
	}

	assert.Equal(t, uint32(0xDEADBEEF), res.Id(), "ids do not match")
	assert.Equal(t, MessageTypeInitRes, res.Type(), "types do not match")
	assertRoundTrip(t, &res, &InitRes{initMessage{id: 0xDEADBEEF}})
}

func assertRoundTrip(t *testing.T, expected Message, actual Message) {
	var b bytes.Buffer
	w := binio.NewWriter(&b)
	require.Nil(t, expected.write(w), fmt.Sprintf("error writing message %s", expected.Type()))
	require.Nil(t, w.Flush(), "error flushing message")

	r := binio.NewReader(bytes.NewReader(b.Bytes()))
	require.Nil(t, actual.read(r), fmt.Sprintf("error reading message %s", expected.Type()))

	assert.Equal(t, expected, actual, fmt.Sprintf("pre- and post-marshal %s do not match", expected.Type()))
}
