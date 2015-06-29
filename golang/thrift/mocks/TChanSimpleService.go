package mocks

import "github.com/uber/tchannel/golang/thrift/gen-go/test"
import "github.com/stretchr/testify/mock"

import "github.com/uber/tchannel/golang/thrift"

type TChanSimpleService struct {
	mock.Mock
}

func (m *TChanSimpleService) Call(ctx thrift.Context, arg *test.Data) (*test.Data, error) {
	ret := m.Called(ctx, arg)

	var r0 *test.Data
	if ret.Get(0) != nil {
		r0 = ret.Get(0).(*test.Data)
	}
	r1 := ret.Error(1)

	return r0, r1
}
func (m *TChanSimpleService) Simple(ctx thrift.Context) error {
	ret := m.Called(ctx)

	r0 := ret.Error(0)

	return r0
}
