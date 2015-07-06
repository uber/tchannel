package raw

import (
	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// WriteArgs writes the given arguments to the call, and returns the response args.
func WriteArgs(call *tchannel.OutboundCall, arg2, arg3 []byte) ([]byte, []byte, *tchannel.OutboundCallResponse, error) {
	if err := tchannel.NewArgWriter(call.Arg2Writer()).Write(arg2); err != nil {
		return nil, nil, nil, err
	}

	if err := tchannel.NewArgWriter(call.Arg3Writer()).Write(arg3); err != nil {
		return nil, nil, nil, err
	}

	resp := call.Response()
	var respArg2 []byte
	if err := tchannel.NewArgReader(resp.Arg2Reader()).Read(&respArg2); err != nil {
		return nil, nil, nil, err
	}

	var respArg3 []byte
	if err := tchannel.NewArgReader(resp.Arg3Reader()).Read(&respArg3); err != nil {
		return nil, nil, nil, err
	}

	return respArg2, respArg3, resp, nil
}

// Call makes a call to the given hostPort with the given arguments and returns the response args.
func Call(ctx context.Context, ch *tchannel.Channel, hostPort string, serviceName, operation string,
	arg2, arg3 []byte) ([]byte, []byte, *tchannel.OutboundCallResponse, error) {

	call, err := ch.BeginCall(ctx, hostPort, serviceName, operation, nil)
	if err != nil {
		return nil, nil, nil, err
	}

	return WriteArgs(call, arg2, arg3)
}
