package tchannel

import (
	"bytes"
	"code.uber.internal/infra/mmihic/tchannel-go/binio"
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
		Arg1:    []byte("login"),
		Arg2:    []byte("thrift-headers"),
		Arg3:    []byte("thrify-body"),
	}

	assertRoundTrip(t, &r, &CallReq{id: 0xDEADBEEF})
}

func TestCallRes(t *testing.T) {
	r := CallRes{
		id:           0xDEADBEEF,
		ResponseCode: ServiceBusy,
		Headers: CallHeaders{
			"r": "c",
			"f": "d",
		},
		Arg1: []byte("login"),
		Arg2: []byte("thrift-headers"),
		Arg3: []byte("thrify-body"),
	}

	assertRoundTrip(t, &r, &CallRes{id: 0xDEADBEEF})
}

func TestMessageWriterReader(t *testing.T) {
	req := &CallReq{
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
		Arg1:    []byte("login"),
		Arg2:    []byte("thrift-headers"),
		Arg3:    []byte("thrify-body"),
	}

	var b bytes.Buffer
	w := NewMessageWriter(&b)
	err := w.Write(req)
	require.Nil(t, err, "error writing message")

	res := &CallRes{
		id:           0xDEADBEEF,
		ResponseCode: ServiceBusy,
		Headers: CallHeaders{
			"r": "c",
			"f": "d",
		},
		Arg1: []byte("login"),
		Arg2: []byte("thrift-headers"),
		Arg3: []byte("thrify-body"),
	}
	err = w.Write(res)
	require.Nil(t, err, "error writing second message")

	r := NewMessageReader(bytes.NewReader(b.Bytes()))
	msg, err := r.Read()
	require.Nil(t, err, "error reading request")
	assert.Equal(t, req, msg, "pre- and post-marshalled requests do not match")

	msg, err = r.Read()
	require.Nil(t, err, "error reading response")
	assert.Equal(t, res, msg, "pre- and post-marshalled responses do not match")
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
