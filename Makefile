GODEPS = $(realpath ./Godeps/_workspace)
GOPATH := $(GODEPS):$(GOPATH)
PATH := $(GODEPS)/bin:$(PATH)
PKGS := ./  ./typed
BUILD := ./build

# target: all - Run tests
all: test

# target: help - Display targets
help:
	@egrep "^# target:" [Mm]akefile | sort -

# target: clean - Cleans build artifacts
clean:
	echo Cleaning build artifacts...
	go clean
	rm -rf $(BUILD)
	echo

# target: fmt - Formats go code
fmt format:
	echo Formatting Packages...
	go fmt $(PKGS) 
	echo

# target: test - Runs tests
test: clean 
	echo Testing packages:
	mkdir -p $(BUILD)
	go test ./ $(TEST_ARG) -parallel=4

# target: cover - Runs tests under code coverage
cover: clean
	echo Testing packages:
	mkdir -p $(BUILD)
	go test ./ $(TEST_ARG)  -coverprofile=$(BUILD)/coverage.out
	go tool cover -html=$(BUILD)/coverage.out
	# TODO(mmihic): Temporarily disabled while working out false positives
	# from go-logging
	#$(MAKE) vet

# target: vet - Vets CLI for issues
vet:
	echo Vetting packages for potential issues...
	go tool vet $(PKGS)
	echo

# target: examples - builds example servers
examples: clean
	echo Building examples...
	mkdir -p $(BUILD)/examples
	go build -o $(BUILD)/examples/server ./examples/server
	go build -o $(BUILD)/examples/client ./examples/client

.PHONY: all help clean fmt format test vet 
.SILENT: all help clean fmt format test vet
	
