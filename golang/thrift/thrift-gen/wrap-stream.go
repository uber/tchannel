package main

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
	"strings"

	"github.com/samuel/go-thrift/parser"
)

// ServerInterface returns the name of the streaming server interface.
func (s *Service) ServerInterface() string {
	return s.Interface() + "Server"
}

// ClientInterface returns the name of the streaming client interface.
func (s *Service) ClientInterface() string {
	return s.Interface() + "Client"
}

// StreamingServerStruct returns the name of the struct that implements ServerInterface.
func (s *Service) StreamingServerStruct() string {
	return "tchan" + goPublicName(s.Name) + "StreamingServer"
}

// StreamingClientStruct returns the name of the struct that implements ClientInterface.
func (s *Service) StreamingClientStruct() string {
	return "tchan" + goPublicName(s.Name) + "StreamingClient"
}

// isStreamingType returns whether the given type should be treated as a stream. This is a
// hack right now, as it just checks whether the suffix is "Stream".
func (m *Method) isStreamingType(t *parser.Type) bool {
	return strings.HasSuffix(t.Name, "Stream")
}

// truncateStreamingType returns the type name for the value that will be passed over the stream.
func (m *Method) truncateStreamingType(t *parser.Type) string {
	return strings.TrimSuffix(t.Name, "Stream")
}

// StreamingArg returns whether the request arguments are streamed.
func (m *Method) StreamingArg() bool {
	if len(m.Method.Arguments) == 0 {
		return false
	}
	return m.isStreamingType(m.Method.Arguments[0].Type)
}

// StreamingArgType returns the type of the argument that is streamed.
func (m *Method) StreamingArgType() string {
	if !m.StreamingArg() {
		panic("m does not contain a streaming arg")
	}

	return m.truncateStreamingType(m.Method.Arguments[0].Type)
}

// StreamingRes returns whether the response results are streamed.
func (m *Method) StreamingRes() bool {
	if !m.HasReturn() {
		return false
	}
	return m.isStreamingType(m.Method.ReturnType)
}

// StreamingResType returns the type of the result that is streamed.
func (m *Method) StreamingResType() string {
	if !m.StreamingRes() {
		panic("m does not contain a streaming res")
	}

	return m.truncateStreamingType(m.Method.ReturnType)
}

// Streaming returns whether this method has any streaming (request or response).
func (m *Method) Streaming() bool {
	return m.StreamingArg() || m.StreamingRes()
}

// StreamingCallList is the call list for a streaming method used to invoke the server's handler.
// If the method has a non-streaming argument, then we get the arguments as well as a call object.
// Otherwise, it is just the context and the call object.
func (m *Method) StreamingCallList(reqStruct string, callName string) string {
	if m.StreamingArg() {
		return fmt.Sprintf("%v, %v", "ctx", callName)
	}

	args := m.callList(reqStruct)
	args = append(args, callName)
	return strings.Join(args, ", ")
}

// InCallName is the name of the call object for inbound calls.
func (m *Method) InCallName() string {
	return m.Name() + "InCall"
}

// OutCallName is the name of the call object for outbound calls.
func (m *Method) OutCallName() string {
	return m.Name() + "OutCall"
}

// StreamingServerHasResult returns whether the server interface has a result in the return
// or whether it's just error.
func (m *Method) StreamingServerHasResult() bool {
	return !m.StreamingRes() && m.HasReturn()
}

// StreamingServerRetType is the return type for the given method in the server interface.
func (m *Method) StreamingServerRetType() string {
	if !m.StreamingRes() {
		return m.RetType()
	}

	// For streaming cases, the return type is just Error, as the call lets them write results.
	return "error"
}

// StreamingServerArgList is the type of arguments for the given method in the server interface.
// If the method is streaming args, it is just the context and the call.
// Otherwise, all the arguments are declared before the call object.
func (m *Method) StreamingServerArgList() string {
	if m.StreamingArg() {
		return fmt.Sprintf("%v, %v", "ctx "+contextType(), "call *"+m.InCallName())
	}

	// For non-streaming, we take all the standard arguments, but append the in call name.
	return strings.Join(append(m.args(), "call *"+m.InCallName()), ", ")
}

// StreamingClientRetType is the return type for this method in the client interface.
func (m *Method) StreamingClientRetType() string {
	// This must be a streaming method, so we always return a call and an error.
	return fmt.Sprintf("(*%v, %v)", m.OutCallName(), "error")
}

// StreamingClientArgList is the type of arguments for the given method in the client interface.
// If the method is streaming, then we only require the context.
// Otherwise, we use all the arguments used in a standard method.
func (m *Method) StreamingClientArgList() string {
	if !m.StreamingArg() {
		return m.ArgList()
	}

	return "ctx " + contextType()
}

// OutDoneRetType is the return type for the Out call's Done method.
// If the result is not streamed, and is not void, then Done returns the single
// response object.
func (m *Method) OutDoneRetType() string {
	if !m.StreamingRes() {
		return m.RetType()
	}
	return "error"
}

// OutDoneHasReturn returns whether the Out call's Done method has a result type (not just error).
func (m *Method) OutDoneHasReturn() bool {
	return !m.StreamingRes() && m.HasReturn()
}

// OutDoneWrapErr is a helper for returning errors in the Out  call's Done method.
func (m *Method) OutDoneWrapErr(err string) string {
	if m.OutDoneHasReturn() {
		return "nil, " + err
	}
	return err
}
