package main

import "github.com/samuel/go-thrift/parser"

// State is global Thrift state for a file with type information.
type State struct {
	// typedefs is a map from a typedef name to the underlying type.
	typedefs map[string]*parser.Type
}

// NewState parses the type information for a parsed Thrift file and returns the state.
func NewState(v *parser.Thrift) *State {
	return &State{v.Typedefs}
}

func (s *State) isBasicType(thriftType string) bool {
	_, ok := thriftToGo[thriftType]
	return ok
}

// rootType recurses through typedefs and returns the underlying type.
func (s *State) rootType(thriftType *parser.Type) *parser.Type {
	if v, ok := s.typedefs[thriftType.Name]; ok {
		return s.rootType(v)
	}
	return thriftType
}

// isResultPointer returns whether the result for this method is a pointer.
func (s *State) isResultPointer(thriftType *parser.Type) bool {
	_, basicGoType := thriftToGo[s.rootType(thriftType).Name]
	return !basicGoType
}

// goType returns the Go type name for the given thrift type.
func (s *State) goType(thriftType *parser.Type) string {
	if thriftType.Name == "list" {
		return "[]" + s.goType(thriftType.KeyType)
	}
	if thriftType.Name == "map" {
		return "map[" + s.goType(thriftType.KeyType) + "]" + s.goType(thriftType.ValueType)
	}

	// If the type is a direct Go type, use that.
	if goType, ok := thriftToGo[thriftType.Name]; ok {
		return goType
	}

	goThriftName := goPublicFieldName(thriftType.Name)

	// Check if the type has a typedef to the direct Go type.
	rootType := s.rootType(thriftType)
	if _, ok := thriftToGo[rootType.Name]; ok {
		return goThriftName
	}
	if rootType.Name == "list" ||
		rootType.Name == "map" {
		return goThriftName
	}

	// If it's a typedef to another struct, then the typedef is defined as a pointer
	// so we do not want the pointer type here.
	if rootType != thriftType {
		return goThriftName
	}

	// If it's not a typedef for a basic type, we use a pointer.
	return "*" + goThriftName
}
