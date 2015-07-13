package raw

// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import (
	"errors"

	"github.com/uber/tchannel/golang"
	"golang.org/x/net/context"
)

// ErrAppError is returned if the application sets an error response.
var ErrAppError = errors.New("application error")

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
