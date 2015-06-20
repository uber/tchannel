
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

default value: `100`

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
type TChannelInRequest : {
    id: Number,
    serviceName: String,

    arg1: Buffer,
    arg2: Buffer,
    arg3: Buffer
}

type TChannelOutResponse : {
    id: Number,
    code: Number,
    ok: Boolean,

    arg1: Buffer,
    arg2: Buffer,
    arg3: Buffer,

    sendOk: (res1: Buffer, res2: Buffer) => void,
    sendNotOk: (res1: Buffer, res2: Buffer) => void
}

type TChannelHandler : {
    handleRequest : (
        req: TChannelInRequest,
        res: TChannelOutResponse
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
 - `serviceName` as a `String`

The outgoing response has a `sendOk()` and `sendNotOk()` method.

 - You can call `sendNotOk(res1, res2)` to send a not-ok response.
   `res1` and `res2` are buffers.
 - You can call `sendOk(res1, res2)` to set `res1` and `res2`
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
            res: {
                ok: Boolean,
                arg2: Buffer,
                arg3: Buffer
            }
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
    default to 100.

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

#### `cb(err, res)`

When you `request.send()` a message to another tchannel server it will
give you a callback

The callback will either get called with `cb(err)` or with
    `cb(null, resp)`

 - `err` will either be `null` or an `Error`. This can be 
    an error like a timeout, IO or tchannel error frame.
 - `resp` will be set, this can be an OK response or an error
    from the remote server.
 - `resp.ok` will be a boolean, dependening on whether this is
    an OK response or an application level error.
 - `resp.arg2` will be the `head` response from the server as a buffer
 - `resp.arg3` will be the `body` response from the server as a buffer



### `channel.close(cb)`

When you want to close your channel you call `.close()`. This
will cleanup the tcp server and any tcp sockets as well
as cleanup any inflight operations.

Your `cb` will get called when it's finished.
