# Set up a Go + Thrift + Hyperbahn Service

The code matching this guide is [here](../examples/keyvalue).

## Dependencies

Make sure your [GOPATH is set up](http://golang.org/doc/code.html) before following this guide.

You'll need to `go get` the following:
* github.com/uber/tchannel/golang
* github.com/uber/tchannel/golang/hyperbahn
* github.com/uber/tchannel/golang/thrift

Use [Godep](https://github.com/tools/godep) to manage dependencies, as the API is still in development and will change.

This example will assume that the service is created in the following directory:
`$GOPATH/src/github.com/uber/tchannel/golang/examples/keyvalue`

You should use your own path and update your import paths accordingly.

## Thrift service

Create a [Thrift](https://thrift.apache.org/) file to define your service. For this guide, we'll use:

`keyvalue.thrift`:
```thrift
service KeyValue {
  string Get(1: string key)
  void Set(1: string key, 2: string value)
}
```

This defines a service named `KeyValue` with two methods:
 * `Get`: a function which takes one string parameter, and returns a string.
 * `Set`: a void function that takes in two parameters.

Once you have defined your service, you should generate the Thrift client by running the following:

```bash
thrift -r --gen go:thrift_import=github.com/apache/thrift/lib/go/thrift keyvalue.thrift
```

## Go server

To get the server ready, the following needs to be done:
1. Create the TChannel which is the network layer protocol.
2. Create a handler to handle the methods defined in the Thrift definition, and register it with tchannel/thrift.
3. Create a Hyperbahn client and register your service with Hyperbahn.

### Create a TChannel
Create a channel using [tchannel.NewChannel](http://godoc.org/github.com/uber/tchannel/golang#NewChannel) and listen using [Channel.ListenAndServe](http://godoc.org/github.com/uber/tchannel/golang#Channel.ListenAndServe).

When creating a channel, you can pass additional [options](http://godoc.org/github.com/uber/tchannel/golang#ChannelOptions).

### Create and register Thrift handler

Create a custom type with methods required by the Thrift generated interface. You can examine this interface by looking in `gen-go/keyvalue/keyvalue.thrift`. For example, the interface for our definition file looks like:
```go
type KeyValue interface {
	// Parameters:
	//  - Key
	Get(key string) (r string, err error)
	// Parameters:
	//  - Key
	//  - Value
	Set(key string, value string) (err error)
}
```
Create an instance of your handler type, and then create a [thrift.Server](http://godoc.org/github.com/uber/tchannel/golang/thrift#NewServer) and [register](http://godoc.org/github.com/uber/tchannel/golang/thrift#Server.Register) your Thrift handler.

### Register with Hyperbahn

Create a Hyperbahn client using [hyperbahn.NewClient](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#NewClient) which requires a list of Hyperbahn nodes to connect to. This should be loaded from a configuration file for the current environment. You can also pass more [options](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#ClientOptions) when creating the client.

Call [Register](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#Client.Register) to register the service with Hyperbahn.

### Serving

Your service is now serving over Hyperbahn! You can test this by making a call using [tcurl](https://github.com/uber/tcurl):

```
node tcurl.js -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT]] keyvalue KeyValue::Set -3 '{"key": "hello", "value": "world"}'
node tcurl.js -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT]] keyvalue KeyValue::Get -3 '{"key": "hello"}'
```

Replace `[HYPERBAHN-HOSTPORT]` with the host:port of the Hyperbahn node, and `[DIR-TO-THRIFT]` with the path to where the .thrift file is stored.

Your service can now be accessed from any language over Hyperbahn + TChannel!

## Go client

Note: The client interface is still in active development.

To make a client that talks, you need to:

1. Create a TChannel (or re-use an existing TChannel)
2. Set up Hyperbahn
3. Create a Thrift client using the TChannel protocol.
4. Make remote calls using the Thrift client.

### Create a TChannel

TChannels are bi-directional and so the client uses the same method as the server code (tchannel.NewChannel) to create a TChannel. You do not need to call ListenAndServe on the channel. Even though the channel does not host a service, a serviceName is required
for TChannel. This serviceName should be unique to identify this client.

You can use an existing TChannel which hosts a service to make client calls.

### Set up Hyperbahn

Similar to the server code, create a new Hyperbahn client using hyperbahn.NewClient. You do not
need to call Register, as the client does not have any services to register.

If you have already set up an existing client for use with a server, then you do not
need to do anything further.

### Create a Thrift client

To create a Thrift protocol, you need:
 * A context
 * The Hyperbahn service name (e.g. the service name passed on the server to NewChannel)
 * The Thrift service name (e.g. the name specified in the Thrift definition file for the service)

These are passed through the `TChanOutboundOptions` when creating a new protocol:

```go
protocol := thrift.NewTChanOutbound(ch, thrift.TChanOutboundOptions{
  Context:          ctx,
  HyperbahnService: "keyvalue",
  ThriftService:    "KeyValue",
})
```

 The client is generated using the same protocol as both the input protocol and the output protocol:
 ```go
 client := keyvalue.NewKeyValueClientProtocol(nil, protocol, protocol)
 ```

No transport is required, as the TChannel protocol is tied to the TChannel transport. The returned client is used to make remote calls to a service.

*Note*: Context is supposed to be passed on a per-call basis. The plan is to generate a client that passes context as the first parameter when making method calls.

### Make remote calls

Method calls on the client make remote calls over TChannel. E.g.
```go
err := client.Set("hello", "world")
val, err := client.Get("hello")
// val = "world"
```

The Thrift client is not thread-safe, and so clients should not be shared across goroutines.
Creating a client is very cheap, as the underlying connections are managed and pooled by TChannel.

## Limitations & Upcoming Changes

TChannel's peer selection does not yet have a detailed health model for nodes, and selection
does not balance load across nodes.

The autogenerated Thrift code is very simple and so there are many features that are not yet exposed:
 * Trace propagation
 * Custom deadlines.
 * Application headers

The API may change to expose these features, although the overall structure of the code will be very similar.
