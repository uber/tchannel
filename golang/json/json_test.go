package json

import (
	"fmt"
	"testing"
	"time"

	"golang.org/x/net/context"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/uber/tchannel/golang"
)

// ForwardArgs are the arguments specifying who to forward to (and the message to forward).
type ForwardArgs struct {
	HeaderVal   string
	Service     string
	Method      string
	NextForward *ForwardArgs
}

// Res is the final result.
type Res struct {
	Result string
}

type testHandler struct {
	calls []string
	peer  *tchannel.Peer
	t     *testing.T
}

func (h *testHandler) forward(ctx Context, args *ForwardArgs) (*Res, error) {
	headerVal := ctx.Headers().(string)
	ctx.SetResponseHeaders(headerVal + "-resp")
	h.calls = append(h.calls, "forward-"+headerVal)

	ctx = WithHeaders(ctx, args.HeaderVal)
	res := &Res{}

	if args.Method == "forward" {
		if err := CallPeer(ctx, h.peer, args.Service, args.Method, args.NextForward, res); err != nil {
			h.t.Errorf("forward->forward Call failed: %v", err)
			return nil, err
		}
		assert.Equal(h.t, args.HeaderVal+"-resp", ctx.ResponseHeaders())
		return res, nil
	}

	if err := CallPeer(ctx, h.peer, args.Service, args.Method, nil, res); err != nil {
		h.t.Errorf("forward->%v Call failed: %v", args.Method, err)
		return nil, err
	}

	return res, nil
}

func (h *testHandler) leaf(ctx Context, _ *struct{}) (*Res, error) {
	headerVal := ctx.Headers().(string)
	h.calls = append(h.calls, "leaf-"+headerVal)
	return &Res{"leaf called!"}, nil
}

func (h *testHandler) onError(ctx context.Context, err error) {
	h.t.Errorf("onError(%v)", err)
}

func TestForwardChain(t *testing.T) {
	servers := map[string]*struct {
		channel   *tchannel.Channel
		handler   *testHandler
		otherPeer string
	}{
		"serv1": {otherPeer: "serv2"},
		"serv2": {otherPeer: "serv3"},
		"serv3": {otherPeer: "serv1"},
	}

	// We want the following call graph:
	// serv1.forward
	// -> (1) serv2.forward
	// -> (2) serv3.forward
	// -> (3) serv1.forward
	// -> (4) serv2.forward
	// ....
	// -> (11) serv3.leaf
	rootArg := &ForwardArgs{}
	curArg := rootArg
	for i := 1; i <= 10; i++ {
		service := fmt.Sprintf("serv%v", (i%3)+1)

		curArg.Method = "forward"
		curArg.HeaderVal = fmt.Sprint(i)
		curArg.Service = service
		curArg.NextForward = &ForwardArgs{}

		curArg = curArg.NextForward
	}
	curArg.Service = "serv3"
	curArg.HeaderVal = "11"
	curArg.Method = "leaf"

	expectedCalls := map[string][]string{
		"serv1": {"forward-initial", "forward-3", "forward-6", "forward-9"},
		"serv2": {"forward-1", "forward-4", "forward-7", "forward-10"},
		"serv3": {"forward-2", "forward-5", "forward-8", "leaf-11"},
	}

	// Use the above data to setup the test and ensure the calls are made as expected.
	for name, s := range servers {
		var err error
		s.channel, err = tchannel.NewChannel(name, nil)
		require.NoError(t, err)

		s.handler = &testHandler{t: t}
		require.NoError(t, Register(s.channel, map[string]interface{}{
			"forward": s.handler.forward,
			"leaf":    s.handler.leaf,
		}, s.handler.onError))

		require.NoError(t, s.channel.ListenAndServe("127.0.0.1:0"))
	}
	for _, s := range servers {
		s.handler.peer = s.channel.Peers().Add(servers[s.otherPeer].channel.PeerInfo().HostPort)
	}

	tctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	ctx := WithHeaders(tctx, "initial")

	sc := servers["serv3"].channel.GetSubChannel("serv1")
	resp := &Res{}
	if assert.NoError(t, CallSC(ctx, sc, "forward", rootArg, resp)) {
		assert.Equal(t, "leaf called!", resp.Result)
		for s, calls := range expectedCalls {
			assert.Equal(t, calls, servers[s].handler.calls)
		}
	}
}
