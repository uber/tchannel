package main

import (
	"fmt"
	"sort"
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

	for k := range baseService.Methods {
		if _, ok := service.Methods[k]; ok {
			return fmt.Errorf("service %v cannot extend base service %v as method %v clashes",
				service.Name, extends, k)
		}
	}

	// Recursively check the baseService for any extends.
	return checkExtends(allServices, service, baseService.Extends)
}

type byServiceName []*Service

func (l byServiceName) Len() int           { return len(l) }
func (l byServiceName) Less(i, j int) bool { return l[i].Service.Name < l[j].Service.Name }
func (l byServiceName) Swap(i, j int)      { l[i], l[j] = l[j], l[i] }

func setExtends(sortedServices []*Service) error {
	for _, s := range sortedServices {
		if s.Extends == "" {
			continue
		}

		foundService := sort.Search(len(sortedServices), func(i int) bool {
			return sortedServices[i].Name >= s.Extends
		})
		if foundService == len(sortedServices) {
			return fmt.Errorf("failed to find base service %q for %q", s.Extends, s.Name)
		}
		s.ExtendsService = sortedServices[foundService]
	}

	return nil
}

func wrapServices(v *parser.Thrift) ([]*Service, error) {
	var services []*Service
	state := NewState(v)
	for _, s := range v.Services {
		if err := checkExtends(v.Services, s, s.Extends); err != nil {
			return nil, err
		}
		if err := Validate(s); err != nil {
			return nil, err
		}

		services = append(services, &Service{s, state, nil})
	}

	sort.Sort(byServiceName(services))
	if err := setExtends(services); err != nil {
		return nil, err
	}

	return services, nil
}

// Service is a wrapper for parser.Service.
type Service struct {
	*parser.Service

	state          *State
	ExtendsService *Service
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

// InternalClientConstructor returns the name of the internal constructor used to create the client
// struct directly. This returns the type of ClientStruct rather than the interface, and is used
// to recursively create any base service clients.
func (s *Service) InternalClientConstructor() string {
	return "newTChan" + goPublicName(s.Name) + "Client"
}

// ServerStruct returns the name of the unexported struct that satisfies TChanServer.
func (s *Service) ServerStruct() string {
	return "tchan" + goPublicName(s.Name) + "Server"
}

// ServerConstructor returns the name of the constructor used to create the TChanServer interface.
func (s *Service) ServerConstructor() string {
	return "NewTChan" + goPublicName(s.Name) + "Server"
}

// InternalServerConstructor is the name of the internal constructor used to create the service
// directly. This returns the type of ServerStruct rather than the interface, and is used
// to recursively create any base service structs.
func (s *Service) InternalServerConstructor() string {
	return "newTChan" + goPublicName(s.Name) + "Server"
}

// HasExtends returns whether this service extends another service.
func (s *Service) HasExtends() bool {
	return s.ExtendsService != nil
}

type byMethodName []*Method

func (l byMethodName) Len() int           { return len(l) }
func (l byMethodName) Less(i, j int) bool { return l[i].Method.Name < l[j].Method.Name }
func (l byMethodName) Swap(i, j int)      { l[i], l[j] = l[j], l[i] }

// Methods returns the methods defined on this service.
func (s *Service) Methods() []*Method {
	var methods []*Method
	for _, m := range s.Service.Methods {
		methods = append(methods, &Method{m, s, s.state})
	}
	sort.Sort(byMethodName(methods))
	return methods
}

// Method is a wrapper for parser.Method.
type Method struct {
	*parser.Method

	service *Service
	state   *State
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
		args = append(args, &Field{f, m.state})
	}
	return args
}

// Exceptions returns the exceptions that this method may return.
func (m *Method) Exceptions() []*Field {
	var args []*Field
	for _, f := range m.Method.Exceptions {
		args = append(args, &Field{f, m.state})
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

func (m *Method) argResPrefix() string {
	return goPublicName(m.service.Name) + m.Name()
}

// ArgsType returns the Go name for the struct used to encode the method's arguments.
func (m *Method) ArgsType() string {
	return m.argResPrefix() + "Args"
}

// ResultType returns the Go name for the struct used to encode the method's result.
func (m *Method) ResultType() string {
	return m.argResPrefix() + "Result"
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
	return fmt.Sprintf("(%v, %v)", m.state.goType(m.Method.ReturnType), "error")
}

// WrapResult wraps the result variable before being used in the result struct.
func (m *Method) WrapResult(respVar string) string {
	if !m.HasReturn() {
		panic("cannot wrap a return when there is no return mode")
	}

	if m.state.isResultPointer(m.ReturnType) {
		return respVar
	}
	return "&" + respVar
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

	state *State
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
	return a.state.goType(a.Type)
}

// ArgStructName returns the name of this field in the Args struct generated by thrift.
func (a *Field) ArgStructName() string {
	return goPublicFieldName(a.Field.Name)
}
