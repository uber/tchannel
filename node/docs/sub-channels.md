## Sub channels

TChannel supports the notion of sub channels. Whenever you want
to implement a serviceName you create a subchannel for it.

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

Whenever you want to talk to a downstream service; you create
a subchannel for it.

### `channel.makeSubChannel()`

### `subChannel.register()`

### `subChannel.request(options)`

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
