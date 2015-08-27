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
