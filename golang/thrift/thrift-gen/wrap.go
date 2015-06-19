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

func checkExtends(allServices map[string]*parser.Service, service *parser.Service, extends string) error {
	if extends == "" {
		return nil
	}

	baseService, ok := allServices[extends]
	if !ok {
		return fmt.Errorf("service %v extends base service %v that is not found", service.Name, extends)
	}

	for k, m := range baseService.Methods {
		if _, ok := service.Methods[k]; ok {
			return fmt.Errorf("service %v cannot extend base service %v as method %v clashes",
				service.Name, extends, k)
		}
		service.Methods[k] = m
	}

	// Recursively check the baseService for any extends.
	return checkExtends(allServices, service, baseService.Extends)
}

func wrapServices(parsedServices map[string]*parser.Service) ([]*Service, error) {
	var services []*Service
	for _, s := range parsedServices {
		if err := checkExtends(parsedServices, s, s.Extends); err != nil {
			return nil, err
		}
		if err := Validate(s); err != nil {
			return nil, err
		}

		services = append(services, &Service{s})
	}
	return services, nil
}

// Service is a wrapper for parser.Service.
type Service struct {
	*parser.Service
}

// ThriftName returns the thrift identifier for this service.
func (s *Service) ThriftName() string {
	return s.Service.Name
}

// Interface returns the name of the interface representing the service.
func (s *Service) Interface() string {
	return "TChan" + goPublicName(s.Name)
}

// ClientStruct returns the name of the unexported struct that satisfies the interface as a client.
func (s *Service) ClientStruct() string {
	return "tchan" + goPublicName(s.Name) + "Client"
}

// ClientConstructor returns the name of the constructor used to create a client.
func (s *Service) ClientConstructor() string {
	return "NewTChan" + goPublicName(s.Name) + "Client"
}

// ServerStruct returns the name of the unexported struct that satisfies TChanServer.
func (s *Service) ServerStruct() string {
	return "tchan" + goPublicName(s.Name) + "Server"
}

// ServerConstructor returns the name of the constructor used to create the TChanServer interface.
func (s *Service) ServerConstructor() string {
	return "NewTChan" + goPublicName(s.Name) + "Server"
}

// Methods returns the methods defined on this service.
func (s *Service) Methods() []*Method {
	var methods []*Method
	for _, m := range s.Service.Methods {
		methods = append(methods, &Method{m})
	}
	return methods
}

// Method is a wrapper for parser.Method.
type Method struct {
	*parser.Method
}

// ThriftName returns the thrift identifier for this function.
func (m *Method) ThriftName() string {
	return m.Method.Name
}

// Name returns the go method name.
func (m *Method) Name() string {
	return goPublicName(m.Method.Name)
}

// HandleFunc is the go method name for the handle function which decodes the payload.
func (m *Method) HandleFunc() string {
	return "handle" + goPublicName(m.Method.Name)
}

// Arguments returns the argument declarations for this method.
func (m *Method) Arguments() []*Field {
	var args []*Field
	for _, f := range m.Method.Arguments {
		args = append(args, &Field{f})
	}
	return args
}

// Exceptions returns the exceptions that this method may return.
func (m *Method) Exceptions() []*Field {
	var args []*Field
	for _, f := range m.Method.Exceptions {
		args = append(args, &Field{f})
	}
	return args
}

// HasReturn returns false if this method is declared as void in the Thrift file.
func (m *Method) HasReturn() bool {
	return m.Method.ReturnType != nil
}

// HasExceptions returns true if this method has
func (m *Method) HasExceptions() bool {
	return len(m.Method.Exceptions) > 0
}

// ArgsType returns the Go name for the struct used to encode the method's arguments.
func (m *Method) ArgsType() string {
	return m.Name() + "Args"
}

// ResultType returns the Go name for the struct used to encode the method's result.
func (m *Method) ResultType() string {
	return m.Name() + "Result"
}

// ArgList returns the argument list for the function.
func (m *Method) ArgList() string {
	args := []string{"ctx " + contextType()}
	for _, arg := range m.Arguments() {
		args = append(args, arg.Declaration())
	}
	return strings.Join(args, ", ")
}

// CallList creates the call to a function satisfying Interface from an Args struct.
func (m *Method) CallList(reqStruct string) string {
	args := []string{"ctx"}
	for _, arg := range m.Arguments() {
		args = append(args, reqStruct+"."+arg.ArgStructName())
	}
	return strings.Join(args, ", ")
}

// RetType returns the go return type of the method.
func (m *Method) RetType() string {
	if !m.HasReturn() {
		return "error"
	}
	return fmt.Sprintf("(%v, %v)", goType(m.Method.ReturnType.Name), "error")
}

// ReturnWith takes the result name and the error name, and generates the return expression.
func (m *Method) ReturnWith(respName string, errName string) string {
	if !m.HasReturn() {
		return errName
	}
	return fmt.Sprintf("%v, %v", respName, errName)
}

// Field is a wrapper for parser.Field.
type Field struct {
	*parser.Field
}

// Declaration returns the declaration for this field.
func (a *Field) Declaration() string {
	return fmt.Sprintf("%s %s", a.Name(), a.ArgType())
}

// Name returns the field name.
func (a *Field) Name() string {
	return goName(a.Field.Name)
}

// ArgType returns the Go type for the given field.
func (a *Field) ArgType() string {
	return goType(a.Type.Name)
}

// ArgStructName returns the name of this field in the Args struct generated by thrift.
func (a *Field) ArgStructName() string {
	return goPublicName(a.Field.Name)
}
