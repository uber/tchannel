GODEPS := $(shell pwd)/Godeps/_workspace
OLDGOPATH := $(GOPATH)
PATH := $(GODEPS)/bin:$(PATH)
PKGS := . ./typed ./examples/server ./examples/client
BUILD := ./build
SRCS := $(foreach pkg,$(PKGS),$(wildcard $(pkg)/*.go))
export GOPATH = $(GODEPS):$(OLDGOPATH)

all: test examples

setup:
	mkdir -p $(BUILD)
	mkdir -p $(BUILD)/examples

install: 
	mkdir -p $(GODEPS)
	GOPATH=$(GODEPS) go get github.com/tools/godep
	GOPATH=$(GODEPS) godep restore

help:
	@egrep "^# target:" [Mm]akefile | sort -

clean:
	echo Cleaning build artifacts...
	go clean
	rm -rf $(BUILD)
	echo

fmt format: 
	echo Formatting Packages...
	go fmt $(PKGS) 
	echo

test_ci: test

test: clean setup
	echo Testing packages:
	go test $(PKGS) $(TEST_ARG) -parallel=4

cover: clean setup
	echo Testing packages:
	mkdir -p $(BUILD)
	go test ./ $(TEST_ARG)  -coverprofile=$(BUILD)/coverage.out
	go tool cover -html=$(BUILD)/coverage.out

vet:
	echo Vetting packages for potential issues...
	go tool vet $(PKGS)
	echo

examples: clean setup
	echo Building examples...
	mkdir -p $(BUILD)/examples
	go build -o $(BUILD)/examples/server ./examples/server
	go build -o $(BUILD)/examples/client ./examples/client

.PHONY: all help clean fmt format test vet 
.SILENT: all help clean fmt format test vet
	
