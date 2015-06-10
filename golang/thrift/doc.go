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

/*
Package thrift adds support to use Thrift services over TChannel.

To start listening to a Thrift service using TChannel, create the channel,
and register the service using:
  server := thrift.NewServer(tchan)
  server.Register("ServiceName", reflect.TypeOf(handler), gen.NewServiceProcessor(handler)

To use a Thrift client using TChannel as the transport, do the following:
  protocol := thrift.NewTChanOutbound(tchan, &thrift.TChanOutboundOptions{
    Context: ctx,
    Dst: "host:port",
    AutobahnService: "service",
  })

  client := gen.NewServiceClientProtocol(nil, protocol, protocol)

This client can be used like a regular Thrift client.

TODO(prashant): Figure out tracing, best practices for how to use the client, etc.
*/
package thrift
