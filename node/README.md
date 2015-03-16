# TChannel

network multiplexing and framing protocol for RPC

## Stability: experimental

NOTE: `master:node` is **not yet stable**

Once we have completed an API that implements all of the v2 protocol, we will
cut the first `node-v2*` tag.  Until then, we are not publishing to npm and the
package.json version will not be updated.

Status is being tracked in #78.

## Example

```js
var TChannel = require('tchannel');
var EndpointHandler = require('tchannel/endpoint-handler');
var CountedReadySignal = require('ready-signal/counted');

var server = new TChannel({
    handler: EndpointHandler()
});
var client = new TChannel();

// normal response
server.handler.register('func 1', function (req, res) {
    console.log('func 1 responding immediately 1:' + req.arg2.toString() + ' 2:' + req.arg3.toString());
    res.send(null, 'result', 'indeed it did');
});
// err response
server.handler.register('func 2', function (req, res) {
    res.send(new Error('it failed'));
});

var ready = CountedReadySignal(2);
var listening = ready(function (err) {
    if (err) {
        throw err;
    }

    client
        .request({host: '127.0.0.1:4040'})
        .send('func 1', "arg 1", "arg 2", function (err, res) {
            console.log('normal res: ' + res.arg2.toString() + ' ' + res.arg3.toString());
        });
    client
        .request({host: '127.0.0.1:4040'})
        .send('func 2', "arg 1", "arg 2", function (err, res) {
            console.log('err res: ' + err.message);
        });

});

server.listen(4040, '127.0.0.1', ready.signal);
client.listen(4041, '127.0.0.1', ready.signal);

```

This example registers two functions on the "server". "func 1" always works and "func 2" always
returns an error. The client sends a request for each function, then prints the result.

Note that every instance is bidirectional. New connections are initiated on demand.

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

## Performance

On a Macbook Pro, we see around 50,000 ops/sec from a single node process talking to one other node
process.

## Documentation

### `var channel = TChannel(options)`

```ocaml
tchannel : (options: {
    handler?: {
        handleRequest : (
            req: Object,
            res: Object
        ) => void
    },

    logger?: Logger,
    timers?: Timers,

    reqTimeoutDefault?: Number,
    serverTimeoutDefault?: Number,
    timeoutCheckInterval?: Number,
    timeoutFuzz?: Number
}) => {
    request: (
        options: Object
    ) => {
        send: (
            arg1: Buffer,
            arg2: Buffer,
            arg3: Buffer,
            cb?: Callback<Error>
        )
    },
    close: (Callback<Error>) => void,
}
```

To create a `channel` you call `TChannel` with some options.

```js
var TChannel = require('tchannel');

var channel = TChannel();

channel.listen(8080, '127.0.0.1');
```

#### `options.logger`

```ocaml
type Logger : {
    debug: (String, Object) => void,
    info: (String, Object) => void,
    warn: (String, Object) => void,
    error: (String, Object) => void,
    fatal: (String, Object) => void
}
```

You can pass in your own logger instance. This will default to
    a null logger that prints no information.

The logger you pass in must implement `debug`, `info`, `warn`,
    `error` and `fatal` methods.

#### `options.timers`

```ocaml
type Timers : {
    setTimeout: (Function, timeout: Number) => id: Number,
    clearTimeout: (id: Number) => void,
    now: () => timestamp: Number
}
```

You can pass in an implementation of various timer methods.

This will allow you to either test TChannel without using
    real timer implementation or pass in an alternative
    implementation of time that's not backed by javascript's
    default implementation of `Date.now()`

#### `options.reqTimeoutDefault`

default value: `5000`

A default timeout for request timeouts.

For every outgoing request which does not have a set timeout i.e. every
`.request()` without a timeout we will default the timeout period 
to be this value.

This means every outgoing operation will be terminated with
    a timeout error if the timeout is hit.

#### `options.timeoutCheckInterval`

default value: `1000`

The interval at which the the TChannel client will scan for
    any outgoing requests which might have timed out.

This means, by default we will scan over every outgoing request
    every 1000 milliseconds to see whether the difference
    between now and when the request has started

#### `options.timeoutFuzz`

default value: `100`

The client interval does not run every N milliseconds, it has
    certain amount of random fuzz, this means it will run

> every `timeoutCheckInterval` +/ `fuzz/2`

This is used to avoid race conditions in the network.

#### `options.handler`

```jsig
type TChannelIncomingRequest : {
    id: Number,
    service: String,

    arg1: Buffer,
    arg2: Buffer,
    arg3: Buffer
}

type TChannelOutgoingResponse : {
    id: Number,
    code: Number,
    ok: Boolean,

    arg1: Buffer,
    arg2: Buffer,
    arg3: Buffer,

    send: (
        ((err: Error, res1: Buffer) => void) &
        ((err: null, res1: Buffer, res2: Buffer) => void)
    )
}

type TChannelHandler : {
    handleRequest : (
        req: TChannelIncomingRequest,
        res: TChannelOutgoingResponse
    ) => void
}
```

default value: A noHandler handler.

The `handler` is required and must have a `handleRequest()`
method.

The `handleRequest` method takes two arguments, an incoming call 
request and an outgoing call response.

The incoming req has

 - `arg1` as a `Buffer`.
 - `arg2` as a `Buffer`.
 - `arg3` as a `Buffer`.
 - `service` as a `String`

The outgoing response has a `send()` method.

 - You can call `send(Error, res1)` to send a not-ok response.
   It will serialize your error for you, with the message as
   res2.
 - You can call `send(null, res1, res2)` to set `res1` and `res2`
   as Buffers for the Call response

### `channel.listen(port, host, callback?)`

Starts listening on the given port and host.

Both port and host are mandatory.

The port may be 0, indicating that the operating system must grant an
available ephemeral port.

The eventual host and port combination must uniquely identify the
TChannel server and it is strongly recommended that the host be the
public IP address.

### `channel.request(options)`

```ocaml
request: (options: {
    host: String,
    timeout?: Number
}) => {
    send: (
        arg1: Buffer | String,
        arg2: Buffer | String,
        arg3: Buffer | String,
        cb: (
            err?: Error,
            res1: Buffer,
            res2: Buffer
        ) => void
    ) => void
}
```

`request()` is used to initiate an outgoing request to another channel.

`TChannel` will format the head (arg2) and body (arg3) for you

 - If you pass a `Buffer` it uses the buffer.
 - If you pass a `String` it will cast it to a buffer.
 - If you pass `undefined` it will cast it to `Buffer(0)`
 - If you pass `null` it will cast it to `Buffer(0)`


#### `options.host`

You must specify the host you want to write to. This should be
    string in the format of `{ip}:{port}`

#### `options.timeout`

You should specify a timeout for this operation. This will
    default to 5000.

This will call your callback with a timeout error if no response
    was received within the timeout.

#### `arg1`

The first argument must be the name of the operation you want
    to call as a string or a buffer.

#### `arg2`

The second argument will be the `head` to send to the server,
    this will be `arg1` in the servers operation function.

#### `arg3`

The third argument will be the `body` to send to the server.
    This will be `arg2` in the servers operation function.

#### `cb(err, res1, res2)`

When you `request.send()` a message to another tchannel server it will
give you a callback

The callback will either get called with `cb(err)` or with
    `cb(null, res1, res2)`

 - `err` will either be `null` or an `Error`. This can be an
    error send from the remote server or another type of error
    like a timeout, IO or 404 error.
 - `res1` will be the `head` response from the server as a buffer
 - `res2` will be the `body` response from the server as a buffer

### `channel.close(cb)`

When you want to close your channel you call `.close()`. This
will cleanup the tcp server and any tcp sockets as well
as cleanup any inflight operations.

Your `cb` will get called when it's finished.

## Further examples

 - [example1.js](examples/example1.js)
 - [example2.js](examples/example2.js)

## Installation

`npm install tchannel`

## Tests

`npm test`

## Contributors

 - mranney
 - jwolski
 - Raynos
 - jcorbin

## MIT Licenced
