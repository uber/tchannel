package tchannel

import (
	"bytes"
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang/typed"
	"testing"
	"time"
)

func TestInitReq(t *testing.T) {
	req := initReq{
		initMessage{
			id:      0xDEADBEEF,
			Version: 0x02,
			initParams: initParams{
				"lang": "en_US",
				"tz":   "GMT",
			},
		},
	}

	assert.Equal(t, uint32(0xDEADBEEF), req.ID(), "ids do not match")
	assert.Equal(t, messageTypeInitReq, req.messageType(), "types do not match")
	assertRoundTrip(t, &req, &initReq{initMessage{id: 0xDEADBEEF}})
}

func TestInitRes(t *testing.T) {
	res := initRes{
		initMessage{
			id:      0xDEADBEEF,
			Version: 0x04,
			initParams: initParams{
				"lang": "en_US",
				"tz":   "GMT",
			},
		},
	}

	assert.Equal(t, uint32(0xDEADBEEF), res.ID(), "ids do not match")
	assert.Equal(t, messageTypeInitRes, res.messageType(), "types do not match")
	assertRoundTrip(t, &res, &initRes{initMessage{id: 0xDEADBEEF}})
}

func TestCallReq(t *testing.T) {
	r := callReq{
		id:         0xDEADBEEF,
		TimeToLive: time.Second * 45,
		Tracing: Tracing{
			TraceID:  294390430934,
			ParentID: 398348934,
			SpanID:   12762782,
		},
		TraceFlags: 0x01,
		Headers: callHeaders{
			"r": "c",
			"f": "d",
		},
		Service: []byte("udr"),
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.ID())
	assert.Equal(t, messageTypeCallReq, r.messageType())
	assertRoundTrip(t, &r, &callReq{id: 0xDEADBEEF})
}

func TestCallReqContinue(t *testing.T) {
	r := callReqContinue{
		id: 0xDEADBEEF,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.ID())
	assert.Equal(t, messageTypeCallReqContinue, r.messageType())
	assertRoundTrip(t, &r, &callReqContinue{id: 0xDEADBEEF})
}

func TestCallRes(t *testing.T) {
	r := callRes{
		id:           0xDEADBEEF,
		ResponseCode: responseApplicationError,
		Headers: callHeaders{
			"r": "c",
			"f": "d",
		},
		Tracing: Tracing{
			TraceID:  294390430934,
			ParentID: 398348934,
			SpanID:   12762782,
		},
		TraceFlags: 0x04,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.ID())
	assert.Equal(t, messageTypeCallRes, r.messageType())
	assertRoundTrip(t, &r, &callRes{id: 0xDEADBEEF})
}

func TestCallResContinue(t *testing.T) {
	r := callResContinue{
		id: 0xDEADBEEF,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.ID())
	assert.Equal(t, messageTypeCallResContinue, r.messageType())
	assertRoundTrip(t, &r, &callResContinue{id: 0xDEADBEEF})
}

func TestErrorMessage(t *testing.T) {
	m := errorMessage{
		errorCode:         ErrorCodeBusy,
		originalMessageID: 0xDEADBEEF,
		message:           "go away",
	}

	assert.Equal(t, messageTypeError, m.messageType())
	assertRoundTrip(t, &m, &errorMessage{})
}

func assertRoundTrip(t *testing.T, expected message, actual message) {
	w := typed.NewWriteBufferWithSize(1024)
	require.Nil(t, expected.write(w), fmt.Sprintf("error writing message %s", expected.messageType()))

	var b bytes.Buffer
	w.FlushTo(&b)

	r := typed.NewReadBufferWithSize(1024)
	_, err := r.FillFrom(bytes.NewReader(b.Bytes()), len(b.Bytes()))
	require.Nil(t, err)
	require.Nil(t, actual.read(r), fmt.Sprintf("error reading message %s", expected.messageType()))

	assert.Equal(t, expected, actual, fmt.Sprintf("pre- and post-marshal %s do not match", expected.messageType()))
}
