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

import (
	"flag"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

var flagThriftBinary = flag.String("thriftBinary", "thrift", "Command to use for the Apache Thrift binary")

func execCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func execThrift(args ...string) error {
	return execCmd(*flagThriftBinary, args...)
}

func deleteRemote(dir string) error {
	files, err := ioutil.ReadDir(dir)
	if err != nil {
		return err
	}

	for _, f := range files {
		if f.IsDir() && strings.HasSuffix(f.Name(), "-remote") {
			fullPath := filepath.Join(dir, f.Name())
			if err := os.RemoveAll(fullPath); err != nil {
				return err
			}
		}
	}

	return nil
}

func runThrift(inFile string, thriftImport string) (string, error) {
	inFile, err := filepath.Abs(inFile)
	if err != nil {
		return "", err
	}

	dir, filename := filepath.Split(inFile)
	baseName := strings.TrimSuffix(filename, filepath.Ext(filename))
	genDir := filepath.Join(dir, "gen-go")
	outDir := filepath.Join(genDir, baseName)

	// Delete any existing generated code for this Thrift file.
	if err := execCmd("rm", "-rf", outDir); err != nil {
		return "", fmt.Errorf("failed to delete directory %s: %v", genDir, err)
	}

	// Generate the Apache Thrift generated code.
	if err := execThrift("-r", "--gen", "go:thrift_import="+thriftImport, "-o", dir, inFile); err != nil {
		return "", fmt.Errorf("Thrift compile failed: %v", err)
	}

	// Delete the -remote folders.
	if err := deleteRemote(outDir); err != nil {
		return "", fmt.Errorf("failed to delete -remote folders: %v", err)
	}

	return filepath.Join(outDir, "tchan-"+baseName), nil
}
