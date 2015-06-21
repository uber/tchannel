# Sub channels

TChannel supports the notion of sub channels. Whenever you want
to implement a serviceName you create a subchannel for it.

Whenever you want to talk to a downstream service; you create
a subchannel for it.

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

## `channel.makeSubChannel(options)`

**Note:** Favor using `hyperbahnClient.getClientChannel()` for
any creating sub channels if your making requests to hyperbahn

See the [hyperbahn](./hyperbahn.md) documentation on how to
create sub channels with hyperbahn

To create a sub channel you call `makeSubChannel` on the root
channel.

```js
var channel = TChannel()

var myChannel = channel.makeSubChannel({
    serviceName: 'my-service'
});
```

### `options.serviceName`

The `serviceName` for this channel. If this is a `serviceName`
that you are implementing then you will probably call `register()`
on the sub channel.

If this is a `serviceName` that you want to talk to then you'll
probably call `request()` on the sub channel.

### `options.peers`

If this sub channel is used to talk to other services then you
want to pre-populate a `peers` list. 

In the hyperbahn use case you will use
`hyperbahnClient.getClientChannel()` and it will prepopulate the
correct hyperbahn peers.

In the peer to peer use case you will want to specify an array
of `host:port` strings for all the other instances you want to
talk to.

If you do not specify a `peers` array you must pass a `host`
option for every outgoing request.

## `var req = subChannel.request(options)`

`request()` is used to initiate an outgoing request to another channel.

### `options.serviceName`

The serviceName that you want to send this request to.

### `options.timeout`

You should specify a timeout for this operation. This will
    default to 100.

This will call your callback with a timeout error if no response
    was received within the timeout.

### `options.headers`

You can set the transport headers for the outgoing response. There
are multiple headers and they are defined in the
[protocol document](../../docs/protocol.md)

There are two required headers, "cn" the caller name and "as" the
arg scheme.

When using the `hyperbahn` client and `as-thrift` library these
headers will be set for you.

### `options.parent`

When making outgoing requests you **must** set the parent; the 
parent is the incoming requests that triggered this outgoing
request.

This is mandatory for tracing to work.

### `options.hasNoParent`

Sometimes you do not have a `parent`; This is only the case if
you are writing tests or if you are truly the edge HTTP service
that made the first tchannel request.

In these cases you can set `hasNoParent` to `true`

### `req.send(arg1, arg2, arg3, cb)`

Consider using [`as-json`](./as-json.md) or 
[`as-thrift`](./as-thrift.md) to make send data down
outgoing requests that use json or thrift encoding.
Calling `send()` directly is for when you want to deal with
binary buffers.

`arg1` is the name of the endpoint you want to call as a string.
`arg2` is generally application headers as a `Buffer`
`arg3` is the body of the outgoing request as a `Buffer`

The `cb` gets called with `cb(err, res, arg2, arg3)`

The callback will either get called with `cb(err)` or with
`cb(null, resp, arg2, arg3)`

 - `err` will either be `null` or an `Error`. This can be 
    an error like a timeout, IO or tchannel error frame.
 - `resp` is the incoming response, this can be an OK
    response or an error from the remote server.
 - `resp.ok` will be a boolean, dependening on whether this is
    an OK response or an application error.
 - `arg2` are the application headers as a `Buffer`
 - `arg3` is the response body as a `Buffer`

## `subChannel.register(name, handler)`

Consider using [`as-json`](./as-json.md) or
[`as-thrift`](./as-thrift.md) to register endpoints
that use json or thrift encoding. Calling `register()` directly
is for when you want to deal with binary buffers.

You can call `register` to register an named endpoint with 
handler

### `handler(req, res, arg2, arg3)`

Your handler will get called with an `IncomingRequest` and an
`OutgoingResponse`.

You will also receive `arg2` and `arg3` as buffers.

### `res.sendOk(arg2, arg3)`

To send an ok response you can call `sendOk()` on the outgoing
response with two buffers for `arg2` and `arg3`

### `res.sendNotOk(arg2, arg3)`

To send an application error response you can call `sendNotOk()`
on the outgoing response with two buffers for `arg2` and `arg3`

### `res.sendError(codeString, codeMessage)`

To send an error frame instead of a call response you can call
`res.sendError()`.

Valid `codeString` values are: `Timeout`, `Cancelled`, `Busy`,
`Declined`, `UnexpectedError`, `BadRequest`, `NetworkError`,
`UnHealthy`, `ProtocolError`

For the samentics of the code string please read the
[protocol document](../../docs/protocol.md)

You can also pass an arbitrary string `codeMessage` that will
be in the error frame.
