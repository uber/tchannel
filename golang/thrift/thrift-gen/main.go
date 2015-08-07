// thrift-gen generates code for Thrift services that can be used with the
// uber/tchannel/thrift package. thrift-gen generated code relies on the
// Apache Thrift generated code for serialization/deserialization, and should
// be a part of the generated code's package.
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
	"bytes"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"text/template"

	"github.com/samuel/go-thrift/parser"
)

var (
	generateThrift      = flag.Bool("generateThrift", false, "Whether to generate all Thrift go code")
	inputFile           = flag.String("inputFile", "", "The .thrift file to generate a client for")
	outputFile          = flag.String("outputFile", "", "The output file to generate go code to")
	defaultTchannelPath = "github.com/uber/tchannel/golang/thrift"
	nlSpaceNL           = regexp.MustCompile(`\n[ \t]+\n`)
)

// TemplateData is the data passed to the template that generates code.
type TemplateData struct {
	Package        string
	Services       []*Service
	ThriftImport   string
	TChannelImport string
}

func main() {
	flag.Parse()
	if *inputFile == "" {
		log.Fatalf("Please specify an inputFile")
	}

	if err := processFile(*generateThrift, *inputFile, *outputFile); err != nil {
		log.Fatal(err)
	}
}

func processFile(generateThrift bool, inputFile string, outputFile string) error {
	if generateThrift {
		if outFile, err := runThrift(inputFile); err != nil {
			return fmt.Errorf("Could not generate thrift output: %v", err)
		} else if outputFile == "" {
			outputFile = outFile
		}
	}

	parser := &parser.Parser{}
	parsed, _, err := parser.ParseFile(inputFile)
	if err != nil {
		return fmt.Errorf("Could not parse .thrift file: %v", err)
	}

	goTmpl := parseTemplate()
	for filename, v := range parsed {
		if err := generateCode(outputFile, goTmpl, packageName(filename), v); err != nil {
			return err
		}
		// TODO(prashant): Support multiple files / includes etc?
		return nil
	}

	return nil
}

func parseTemplate() *template.Template {
	funcs := map[string]interface{}{
		"contextType": contextType,
	}
	return template.Must(template.New("thrift-gen").Funcs(funcs).Parse(serviceTmpl))
}

func generateCode(outputFile string, tmpl *template.Template, pkg string, parsed *parser.Thrift) error {
	wrappedServices, err := wrapServices(parsed)
	if err != nil {
		log.Fatalf("Service parsing error: %v", err)
	}

	buf := &bytes.Buffer{}

	tchan := defaultTchannelPath
	thrift := *thriftImport

	td := TemplateData{
		Package:        pkg,
		Services:       wrappedServices,
		ThriftImport:   thrift,
		TChannelImport: tchan,
	}
	if err := tmpl.Execute(buf, td); err != nil {
		return fmt.Errorf("failed to execute template: %v", err)
	}

	generated := cleanGeneratedCode(buf.Bytes())
	if err := ioutil.WriteFile(outputFile, generated, 0666); err != nil {
		return fmt.Errorf("cannot write output file %s: %v", outputFile, err)
	}

	// Run gofmt on the file (ignore any errors)
	exec.Command("gofmt", "-w", outputFile).Run()
	return nil
}

func packageName(fullPath string) string {
	// TODO(prashant): Remove any characters that are not valid in Go package names.
	_, filename := filepath.Split(fullPath)
	file := strings.TrimSuffix(filename, filepath.Ext(filename))
	return strings.ToLower(file)
}

func cleanGeneratedCode(generated []byte) []byte {
	generated = nlSpaceNL.ReplaceAll(generated, []byte("\n"))
	return generated
}

func contextType() string {
	return "thrift.Context"
}
