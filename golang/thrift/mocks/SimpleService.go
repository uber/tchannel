package mocks

import "github.com/uber/tchannel/golang/thrift/gen-go/test"
import "github.com/stretchr/testify/mock"

type SimpleService struct {
	mock.Mock
}

func (m *SimpleService) Call(arg *test.Data) (*test.Data, error) {
	ret := m.Called(arg)

	var r0 *test.Data
	if ret.Get(0) != nil {
		r0 = ret.Get(0).(*test.Data)
	}
	r1 := ret.Error(1)

	return r0, r1
}
func (m *SimpleService) Simple() error {
	ret := m.Called()

	r0 := ret.Error(0)

	return r0
}
func (m *SimpleService) OneWay() error {
	ret := m.Called()

	r0 := ret.Error(0)

	return r0
}
