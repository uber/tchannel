package json

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
	"fmt"

	"github.com/uber/tchannel/golang"
)

// ErrApplication is an application error which contains the object returned from the other side.
type ErrApplication map[string]interface{}

func (e ErrApplication) Error() string {
	return fmt.Sprintf("JSON call failed: %v", map[string]interface{}(e))
}

func makeCall(ctx Context, call *tchannel.OutboundCall, arg interface{}, resp interface{}) error {
	// Encode any headers as a JSON object.
	if err := tchannel.NewArgWriter(call.Arg2Writer()).WriteJSON(ctx.Headers()); err != nil {
		return fmt.Errorf("arg2 write failed: %v", err)
	}
	if err := tchannel.NewArgWriter(call.Arg3Writer()).WriteJSON(arg); err != nil {
		return fmt.Errorf("arg3 write failed: %v", err)
	}

	// Call Arg2Reader before application error.
	var respHeaders interface{}
	if err := tchannel.NewArgReader(call.Response().Arg2Reader()).ReadJSON(&respHeaders); err != nil {
		return fmt.Errorf("arg2 read failed: %v", err)
	}
	ctx.SetResponseHeaders(respHeaders)

	// If this is an error response, read the response into a map and return a jsonCallErr.
	if call.Response().ApplicationError() {
		errResponse := make(ErrApplication)
		if err := tchannel.NewArgReader(call.Response().Arg3Reader()).ReadJSON(&errResponse); err != nil {
			return fmt.Errorf("arg3 read error failed: %v", err)
		}
		return errResponse
	}

	if err := tchannel.NewArgReader(call.Response().Arg3Reader()).ReadJSON(resp); err != nil {
		return fmt.Errorf("arg3 read failed: %v", err)
	}

	return nil
}

// CallPeer makes a JSON call using the given peer.
func CallPeer(ctx Context, peer *tchannel.Peer, serviceName, operation string, arg interface{}, resp interface{}) error {
	call, err := peer.BeginCall(ctx, serviceName, operation, &tchannel.CallOptions{Format: tchannel.JSON})
	if err != nil {
		return err
	}

	return makeCall(ctx, call, arg, resp)
}

// CallSC makes a JSON call using the given subchannel.
func CallSC(ctx Context, sc *tchannel.SubChannel, operation string, arg interface{}, resp interface{}) error {
	call, err := sc.BeginCall(ctx, operation, &tchannel.CallOptions{Format: tchannel.JSON})
	if err != nil {
		return err
	}

	return makeCall(ctx, call, arg, resp)
}
