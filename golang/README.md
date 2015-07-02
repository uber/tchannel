# TChannel

[![GoDoc](https://godoc.org/github.com/uber/tchannel/golang?status.svg)](https://godoc.org/github.com/uber/tchannel/golang)

network multiplexing and framing protocol for RPC

## Stability: experimental

NOTE: `master:golang` is **not yet stable**

## Thrift + TChannel Integration

If you want to use Thrift+TChannel, you will want to read [this guide](guide/Thrift_Hyperbahn.md).

## Getting Started

Get Go from your package manager of choice or follow the [official installation instructions](https://golang.org/doc/install).

```bash
brew install go

# This will be your GOPATH where all Go code will live.
mkdir -p ~/golang/src
```

Set up your environment for your shell of choice.

```bash
export GOPATH="${HOME}/golang"
export PATH="${PATH}":"${GOPATH}/bin"
```

TChannel uses [godep](https://github.com/tools/godep) to manage dependencies.  To get started:

```bash
go get github.com/uber/tchannel/golang
go get github.com/tools/godep
cd $GOPATH/src/github.com/uber/tchannel/golang
godep restore
make
```
### Examples

Simple examples are included which demonstrate the TChannel API and features.


#### PingPong
```bash
./build/examples/ping/pong
```

This example creates a client and server channel.  The server channel registers a PingService
with a ping operation, which takes request Headers and a Ping body and returns the
same Headers along with a Pong body.  The client sends a ping request to the server

Note that every instance is bidirectional, so the same channel can be used for both sending
and receiving requests to peers.  New connections are initiated on demand.

#### HelloWorld

```bash
cd build/examples/hello
./server
```

```bash
cd build/examples/hello
./client
```

This example uses separate binaries for the server and client channel. The server registers
a `HelloService` with a single method `echo`. This method replies with the same arguments
it receives. The client sends 'hello' 'world' and receives the same reply from the server.

## Overview

TChannel is a network protocol with the following goals:

 * request / response model
 * multiple requests multiplexed across the same TCP socket
 * out of order responses
 * streaming request and responses
 * all frames checksummed
 * transport arbitrary payloads
 * easy to implement in multiple languages
 * near-redis performance

This protocol is intended to run on datacenter networks for inter-process communication.

## Protocol

TChannel frames have a fixed length header and 3 variable length fields. The underlying protocol
does not assign meaning to these fields, but the included client/server implementation uses
the first field to represent a unique endpoint or function name in an RPC model.
The next two fields can be used for arbitrary data. Some suggested way to use the 3 fields are:

* URI path, HTTP method and headers as JSON, body
* function name, headers, thrift / protobuf

Note however that the only encoding supported by TChannel is UTF-8.  If you want JSON, you'll need
to stringify and parse outside of TChannel.

This design supports efficient routing and forwarding of data where the routing information needs
to parse only the first or second field, but the 3rd field is forwarded without parsing.

There is no notion of client and server in this system. Every TChannel instance is capable of
making or receiving requests, and thus requires a unique port on which to listen. This requirement may
change in the future.

 - See [protocol.md](../docs/protocol.md) for more details

## Further examples

 - [server](examples/hello/server/main.go)
 - [client](examples/hello/client/main.go)
 - [ping](examples/ping/main.go)
 - [keyvalue](examples/keyvalue)
 - [thrift](examples/thrift)

## Tests

`make test` or `make cover`

## Contributors

 - mmihic
 - prashantv

## MIT Licenced
