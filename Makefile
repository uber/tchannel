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
	LC_ALL="en_US.UTF-8" \
		go test $(PKGS) -parallel 4 $(TEST_ARG)
	echo
	# TODO(mmihic): Temporarily disabled while working out false positives
	# from go-logging
	#$(MAKE) vet

# target: vet - Vets CLI for issues
vet:
	echo Vetting packages for potential issues...
	go tool vet $(PKGS)
	echo

# target: examples - builds example servers
examples: test
	echo Building examples...
	mkdir -p $(BUILD)
	go build -o $(BUILD)/server ./examples/server
	go build -o $(BUILD)/client ./examples/client

.PHONY: all help clean fmt format test vet 
.SILENT: all help clean fmt format test vet
	
