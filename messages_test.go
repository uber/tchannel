package tchannel

import (
	"bytes"
	"code.uber.internal/personal/mmihic/tchannel-go/typed"
	"fmt"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
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

func TestCallReq(t *testing.T) {
	r := CallReq{
		id:         0xDEADBEEF,
		TimeToLive: time.Second * 45,
		Tracing: Tracing{
			TraceId:  294390430934,
			ParentId: 398348934,
			SpanId:   12762782,
		},
		TraceFlags: 0x01,
		Headers: CallHeaders{
			"r": "c",
			"f": "d",
		},
		Service: []byte("udr"),
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.Id())
	assert.Equal(t, MessageTypeCallReq, r.Type())
	assertRoundTrip(t, &r, &CallReq{id: 0xDEADBEEF})
}

func TestCallReqContinue(t *testing.T) {
	r := CallReqContinue{
		id: 0xDEADBEEF,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.Id())
	assert.Equal(t, MessageTypeCallReqContinue, r.Type())
	assertRoundTrip(t, &r, &CallReqContinue{id: 0xDEADBEEF})
}

func TestCallRes(t *testing.T) {
	r := CallRes{
		id:           0xDEADBEEF,
		ResponseCode: ResponseApplicationError,
		Headers: CallHeaders{
			"r": "c",
			"f": "d",
		},
		Tracing: Tracing{
			TraceId:  294390430934,
			ParentId: 398348934,
			SpanId:   12762782,
		},
		TraceFlags: 0x04,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.Id())
	assert.Equal(t, MessageTypeCallRes, r.Type())
	assertRoundTrip(t, &r, &CallRes{id: 0xDEADBEEF})
}

func TestCallResContinue(t *testing.T) {
	r := CallResContinue{
		id: 0xDEADBEEF,
	}

	assert.Equal(t, uint32(0xDEADBEEF), r.Id())
	assert.Equal(t, MessageTypeCallResContinue, r.Type())
	assertRoundTrip(t, &r, &CallResContinue{id: 0xDEADBEEF})
}

func TestErrorMessage(t *testing.T) {
	m := ErrorMessage{
		ErrorCode:         ErrorCodeBusy,
		OriginalMessageId: 0xDEADBEEF,
		Message:           "go away",
	}

	assert.Equal(t, MessageTypeError, m.Type())
	assertRoundTrip(t, &m, &ErrorMessage{})
}

func assertRoundTrip(t *testing.T, expected Message, actual Message) {
	w := typed.NewWriteBufferWithSize(1024)
	require.Nil(t, expected.write(w), fmt.Sprintf("error writing message %s", expected.Type()))

	var b bytes.Buffer
	w.FlushTo(&b)

	r := typed.NewReadBufferWithSize(1024)
	_, err := r.FillFrom(bytes.NewReader(b.Bytes()), len(b.Bytes()))
	require.Nil(t, err)
	require.Nil(t, actual.read(r), fmt.Sprintf("error reading message %s", expected.Type()))

	assert.Equal(t, expected, actual, fmt.Sprintf("pre- and post-marshal %s do not match", expected.Type()))
}
