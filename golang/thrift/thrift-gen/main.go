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
	"io/ioutil"
	"log"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"text/template"

	"github.com/samuel/go-thrift/parser"
)

// noNewLiteral is used in templates to specify that the following newline should be removed.
const noNewLiteral = "[[COLLAPSE-NL]]"

var (
	inputFile  = flag.String("inputFile", "", "The .thrift file to generate a client for")
	outputFile = flag.String("outputFile", "out.go", "The output file to generate go code to")

	// These regexps are used to clean up the generated template code a little.
	spaceRegexp = regexp.MustCompile(`[ ]+`)
	nlRegexp    = regexp.MustCompile(`\n\n+`)
	noNLRegexp  = regexp.MustCompile(`[ \t]*\[\[COLLAPSE\-NL\]\][ \t]*`)
)

var funcs = map[string]interface{}{
	"contextType": contextType,
	"nonl":        noNewLine,
}

// TemplateData is the data passed to the template that generates code.
type TemplateData struct {
	Package  string
	Services []*Service
}

func main() {
	flag.Parse()

	parser := &parser.Parser{}
	parsed, _, err := parser.ParseFile(*inputFile)
	if err != nil {
		log.Fatalf("Could not parse .thrift file: %v", err)
	}

	goTmpl := template.Must(template.New("thrift-gen").Funcs(funcs).ParseFiles("services.tmpl"))
	for filename, v := range parsed {
		wrappedServices, err := wrapServices(v)
		if err != nil {
			log.Fatalf("Service parsing error: %v", err)
		}

		buf := &bytes.Buffer{}
		td := TemplateData{
			Package:  packageName(filename),
			Services: wrappedServices,
		}
		if err := goTmpl.ExecuteTemplate(buf, "services.tmpl", td); err != nil {
			log.Fatalf("err: %v", err)
		}

		generated := cleanGeneratedCode(buf.Bytes())
		if err := ioutil.WriteFile(*outputFile, generated, 0666); err != nil {
			log.Fatalf("Could not write output file %s: %v", *outputFile, err)
		}

		// Run gofmt on the file (ignore any errors)
		exec.Command("gofmt", "-w", *outputFile).Run()
	}
}

func packageName(fullPath string) string {
	// TODO(prashant): Remove any characters that are not valid in Go package names.
	_, filename := filepath.Split(fullPath)
	file := strings.TrimSuffix(filename, filepath.Ext(filename))
	return strings.ToLower(file)
}

func cleanGeneratedCode(generated []byte) []byte {
	generated = noNLRegexp.ReplaceAll(generated, []byte(noNewLiteral))
	generated = bytes.Replace(generated, []byte(noNewLiteral+"\n"), nil, -1)
	generated = spaceRegexp.ReplaceAll(generated, []byte(" "))
	generated = nlRegexp.ReplaceAll(generated, []byte("\n\n"))
	return generated
}

// Template functions
func noNewLine() string {
	return noNewLiteral
}

func contextType() string {
	return "thrift.Context"
}
