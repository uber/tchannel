package mocks

import "github.com/stretchr/testify/mock"

import "github.com/uber/tchannel/golang/thrift"

type TChanSecondService struct {
	mock.Mock
}

func (m *TChanSecondService) Echo(ctx thrift.Context, arg string) (string, error) {
	ret := m.Called(ctx, arg)

	r0 := ret.Get(0).(string)
	r1 := ret.Error(1)

	return r0, r1
}
