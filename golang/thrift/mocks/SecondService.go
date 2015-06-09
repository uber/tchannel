package mocks

import "github.com/stretchr/testify/mock"

type SecondService struct {
	mock.Mock
}

func (m *SecondService) Echo(arg string) (string, error) {
	ret := m.Called(arg)

	r0 := ret.Get(0).(string)
	r1 := ret.Error(1)

	return r0, r1
}
