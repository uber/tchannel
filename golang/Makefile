GODEPS := $(shell pwd)/Godeps/_workspace
OLDGOPATH := $(GOPATH)
PATH := $(GODEPS)/bin:$(PATH)
PKGS := . ./typed ./examples/hello/server ./examples/hello/client ./examples/ping ./examples/thrift
BUILD := ./build
SRCS := $(foreach pkg,$(PKGS),$(wildcard $(pkg)/*.go))
export GOPATH = $(GODEPS):$(OLDGOPATH)

all: test examples

setup:
	mkdir -p $(BUILD)
	mkdir -p $(BUILD)/examples

install:
	# Totally insane, but necessary to setup a proper GOPATH given that we are not
	# running under a standard go travis environment
	mkdir -p $(GODEPS)/src/github.com/uber/tchannel
	ln -s $(shell pwd) $(GODEPS)/src/github.com/uber/tchannel/golang
	GOPATH=$(GODEPS) go get github.com/tools/godep
	GOPATH=$(GODEPS) godep restore

help:
	@egrep "^# target:" [Mm]akefile | sort -

clean:
	echo Cleaning build artifacts...
	go clean
	rm -rf $(BUILD)
	rm -rf $(BUILD)/examples/thrift/gen-go
	echo

fmt format:
	echo Formatting Packages...
	go fmt $(PKGS)
	echo

test_ci: test

test: clean setup
	echo Testing packages:
	go test $(PKGS) $(TEST_ARG) -parallel=4

benchmark: clean setup
	echo Running benchmarks:
	go test $(PKGS) -bench=. -parallel=4

cover: clean setup
	echo Testing packages:
	mkdir -p $(BUILD)
	go test ./ $(TEST_ARG)  -coverprofile=$(BUILD)/coverage.out
	go tool cover -html=$(BUILD)/coverage.out

vet:
	echo Vetting packages for potential issues...
	go tool vet $(PKGS)
	echo

thrift_example: thrift_gen
	go build -o $(BUILD)/examples/thrift       ./examples/thrift/main.go

examples: clean setup thrift_example
	echo Building examples...
	mkdir -p $(BUILD)/examples/hello $(BUILD)/examples/ping
	go build -o $(BUILD)/examples/hello/server ./examples/hello/server
	go build -o $(BUILD)/examples/hello/client ./examples/hello/client
	go build -o $(BUILD)/examples/ping/pong    ./examples/ping/main.go

thrift_gen:
	cd examples/thrift && thrift -r --gen go:thrift_import=github.com/apache/thrift/lib/go/thrift test.thrift

.PHONY: all help clean fmt format test vet
.SILENT: all help clean fmt format test vet
