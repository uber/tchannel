package main

import (
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func execCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
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

	// Delete any existing generated code.
	if err := execCmd("rm", "-rf", genDir); err != nil {
		return "", fmt.Errorf("failed to delete directory %s: %v", genDir, err)
	}

	// Create the directory.
	if err := os.Mkdir(genDir, 0777); err != nil {
		return "", fmt.Errorf("failed to create directory %s: %v", genDir, err)
	}

	// Generate the Apache Thrift generated code.
	if err := execCmd("thrift", "-r", "--gen", "go:thrift_import="+thriftImport, "-o", dir, inFile); err != nil {
		return "", fmt.Errorf("Thrift compile failed: %v", err)
	}

	// Delete the -remote folders.
	if err := deleteRemote(outDir); err != nil {
		return "", fmt.Errorf("failed to delete -remote folders: %v", err)
	}

	return filepath.Join(outDir, "tchan-"+baseName+".go"), nil
}
