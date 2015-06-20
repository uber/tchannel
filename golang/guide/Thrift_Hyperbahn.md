# Set up a Go + Thrift + Hyperbahn Service

The code matching this guide is [here](../examples/keyvalue).

This version of TChannel+Thrift generates code using thrift-gen. This new method has known limitations:
 * Only supports a single thrift file at a time.
 * No support for TChannel headers or error frames.

There may be bugs with the code generation used as well.

## Dependencies

Make sure your [GOPATH is set up](http://golang.org/doc/code.html) before following this guide.

You'll need to `go get` the following:
* github.com/uber/tchannel/golang
* github.com/uber/tchannel/golang/hyperbahn
* github.com/uber/tchannel/golang/thrift
* github.com/uber/tchannel/golang/thrift-gen

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
# cd to directory thrift-gen inside the tchannel/thrift/ folder.
./generate.sh ~/src/keyvalue/keyvalue.thrift
```

This runs the Thrift compiler, and `thrift-gen` to generate the client and service bindings.
You can run the commands manually as well:

```bash
# Generate serialization/deserialization logic.
thrift -r --gen go:thrift_import=github.com/apache/thrift/lib/go/thrift keyvalue.thrift

# Generate TChannel service interfaces in the same directory where Thrift generates code.
thrift-gen --inputFile "$THRIFTFILE" --outputFile "THRIFT_FILE_FOLDER/gen-go/thriftName/tchan-keyvalue.go"
```

## Go server

To get the server ready, the following needs to be done:
1. Create the TChannel which is the network layer protocol.
2. Create a handler to handle the methods defined in the Thrift definition, and register it with tchannel/thrift.
3. Create a Hyperbahn client and advertise your service with Hyperbahn.

### Create a TChannel
Create a channel using [tchannel.NewChannel](http://godoc.org/github.com/uber/tchannel/golang#NewChannel) and listen using [Channel.ListenAndServe](http://godoc.org/github.com/uber/tchannel/golang#Channel.ListenAndServe).

The address passed to Listen should be a remote IP that can be used for incoming connections from other machines. You can use [tchannel.ListenIP](http://godoc.org/github.com/uber/tchannel/golang#ListenIP) which uses heuristics to determine a good remote IP.

When creating a channel, you can pass additional [options](http://godoc.org/github.com/uber/tchannel/golang#ChannelOptions).

### Create and register Thrift handler

Create a custom type with methods required by the Thrift generated interface. You can examine this interface by looking in `gen-go/keyvalue/tchan-keyvalue.go`. For example, the interface for our definition file looks like:
```go
type TChanKeyValue interface {
	Get(ctx thrift.Context, key string) (r string, err error)
	Set(ctx thrift.Context, key string, value string) (err error)
}
```
Create an instance of your handler type, and then create a [thrift.Server](http://godoc.org/github.com/uber/tchannel/golang/thrift#NewServer) and [register](http://godoc.org/github.com/uber/tchannel/golang/thrift#Server.RegisterV2) your Thrift handler.

### Advertise with Hyperbahn

Create a Hyperbahn client using [hyperbahn.NewClient](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#NewClient) which requires a Hyperbahn configuration object that should be loaded from a configuration file for the current environment. You can also pass more [options](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#ClientOptions) when creating the client.

Call [Advertise](http://godoc.org/github.com/uber/tchannel/golang/hyperbahn#Client.Advertise) to advertise the service with Hyperbahn.

### Serving

Your service is now serving over Hyperbahn! You can test this by making a call using [tcurl](https://github.com/uber/tcurl):

```
node tcurl.js -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT]] keyvalue KeyValue::Set -3 '{"key": "hello", "value": "world"}'
node tcurl.js -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT]] keyvalue KeyValue::Get -3 '{"key": "hello"}'
```

Replace `[HYPERBAHN-HOSTPORT]` with the host:port of the Hyperbahn node, and `[DIR-TO-THRIFT]` with the path to where the .thrift file is stored.

Your service can now be accessed from any language over Hyperbahn + TChannel!

## Go client

Note: The client implementation is still in active development.

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
need to call Advertise, as the client does not have any services to advertise over Hyperbahn.

If you have already set up an existing client for use with a server, then you do not
need to do anything further.

### Create a Thrift client

The Thrift client has two parts:
1. The `thrift.TChanClient` which is configured to hit a specific Hyperbahn service.
2. A generated client which uses an underlying `thrift.TChanClient` to call methods for a specific Thrift service.

To create a `thrift.TChanClient`, use `thrift.NewClient`. This client can then be used to create a generated client:
```go
thriftClient := thrift.NewClient(ch, "keyvalue", nil)
client := keyvalue.NewTChanKeyValueClient(thriftClient)
```

### Make remote calls

Method calls on the client make remote calls over TChannel. E.g.
```go
err := client.Set(ctx, "hello", "world")
val, err := client.Get(ctx, "hello")
// val = "world"
```

You must pass a context when making method calls which passes the deadline, and in future, additional context such as application headers.

## Limitations & Upcoming Changes

TChannel's peer selection does not yet have a detailed health model for nodes, and selection
does not balance load across nodes.

The thrift-gen autogenerated code is very new and may have many bugs.
