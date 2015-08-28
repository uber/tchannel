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

package mocks

import "github.com/uber/tchannel/golang/trace/thrift/gen-go/tcollector"
import "github.com/stretchr/testify/mock"

import "github.com/uber/tchannel/golang/thrift"

type TChanTCollector struct {
	mock.Mock
}

func (_m *TChanTCollector) MultiSubmit(ctx thrift.Context, spans []*tcollector.Span) ([]*tcollector.Response, error) {
	ret := _m.Called(ctx, spans)

	var r0 []*tcollector.Response
	if rf, ok := ret.Get(0).(func(thrift.Context, []*tcollector.Span) []*tcollector.Response); ok {
		r0 = rf(ctx, spans)
	} else {
		if ret.Get(0) != nil {
			r0 = ret.Get(0).([]*tcollector.Response)
		}
	}

	var r1 error
	if rf, ok := ret.Get(1).(func(thrift.Context, []*tcollector.Span) error); ok {
		r1 = rf(ctx, spans)
	} else {
		r1 = ret.Error(1)
	}

	return r0, r1
}
func (_m *TChanTCollector) Submit(ctx thrift.Context, span *tcollector.Span) (*tcollector.Response, error) {
	ret := _m.Called(ctx, span)

	var r0 *tcollector.Response
	if rf, ok := ret.Get(0).(func(thrift.Context, *tcollector.Span) *tcollector.Response); ok {
		r0 = rf(ctx, span)
	} else {
		if ret.Get(0) != nil {
			r0 = ret.Get(0).(*tcollector.Response)
		}
	}

	var r1 error
	if rf, ok := ret.Get(1).(func(thrift.Context, *tcollector.Span) error); ok {
		r1 = rf(ctx, span)
	} else {
		r1 = ret.Error(1)
	}

	return r0, r1
}
