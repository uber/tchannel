# TChannel

network multiplexing and framing protocol for RPC

## Stability: experimental

NOTE: `master:golang` is **not yet stable**

## Example

```golang
import (
    "encoding/json"
    "time"
    "github.com/uber/tchannel/golang"
    "code.google.com/p/go.net/context"
    "fmt"
)

type Headers map[string]string

type Ping struct {
    Message string `json:"message"`
}

type Pong struct {
    Message string `json:"message"`
}

func ping(ctx context.Context, call *tchannel.InboundCall) {
    var headers Header

    if err := call.ReadArg2(tchannel.NewJSONInput(&headers)); err != nil {
        fmt.Printf("Could not read headers from client: %v", err)
        return
    }

    var ping Ping
    if err := call.ReadArg3(tchannel.NewJSONInput(&ping)); err != nil {
        fmt.Printf("Could not read body from client: %v", err)
        return
    }

    if err := call.Response().WriteArg2(tchannel.NewJSONOutput(headers)); err != nil {
        fmt.Printf("Could not echo response headers to client: %v", err)
        return
    }

    pong := Pong{Message: fmt.Sprintf("ping %s", ping.Message)}
    if err := call.Response().WriteArg3(tchannel.NewJSONOutput(pong)); err != nil {
        fmt.Printf("Could not write response body to client: %v", err)
        return
    }
}

func main() {
    // Create a new TChannel for handling requests
    server, err := tchannel.NewChannel("localhost:8050", nil)
    if err != nil {
        panic(err)
    }

    // Register a handler for the ping message on the PingService
    server.Register(tchannel.HandleFunc(ping), "PingService", "ping")

    // Listen for incoming requests
    go server.ListenAndHandle()

    // Create a new TChannel for sending requests.  
    client, err := tchannel.NewChannel("localhost:8051", nil)
    if err != nil {
        panic(err)
    }

    // Listen for bi-directional messages
    go client.ListenAndHandle()

    // Make a call to ourselves, with a timeout of 10s
    ctx, cancel := context.WithTimeout(context.Background(), time.Second * 10)
    defer cancel()

    var responseHeaders Headers
    var pong Pong
    if err := client.RoundTrip("localhost:8050", "PingService", "ping",
        tchannel.NewJSONOutput(Headers{}),  tchannel.NewJSONOutput(Ping{Message: "Hello world"}),
        tchannel.NewJSONInput(&responseHeaders), tchannel.NewJSONInput(&pong)); err != nil {
        panic(err)
    }

    fmt.Printf("Received pong: %s\n", pong.Message)
}
```

This examples creates a client and server channel.  The server channel registers a PingService
with a ping operation, which takes request Headers and a Ping body and returns the
same Headers along with a Pong body.  The client sends a ping request to the server

Note that every instance is bidirectional, so the same channel can be used for both sending
and receiving requests to peers.  New connections are initiated on demand.

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

 - See [docs/protocol.md](docs/protocol.md) for more details

## Further examples

 - [server](examples/server/main.go)
 - [client](examples/client/main.go)

## Tests

`make test` or `make cover1

## Contributors

 - mmihic

## MIT Licenced

