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

package main

import "github.com/samuel/go-thrift/parser"

// State is global Thrift state for a file with type information.
type State struct {
	// typedefs is a map from a typedef name to the underlying type.
	typedefs map[string]*parser.Type
}

// NewState parses the type information for a parsed Thrift file and returns the state.
func NewState(v *parser.Thrift) *State {
	typedefs := make(map[string]*parser.Type)
	for k, v := range v.Typedefs {
		typedefs[k] = v
	}

	// Enums are typedefs to an int64.
	i64Type := &parser.Type{Name: "i64"}
	for k := range v.Enums {
		typedefs[k] = i64Type
	}

	return &State{typedefs}
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
	switch thriftType.Name {
	case "binary":
		return "[]byte"
	case "list":
		return "[]" + s.goType(thriftType.ValueType)
	case "set":
		return "map[" + s.goType(thriftType.ValueType) + "]bool"
	case "map":
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
		rootType.Name == "set" ||
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
