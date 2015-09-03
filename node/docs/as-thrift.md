# as/thrift

The following is documentation on how to use the `as/thrift` implementation
to handle encoding and decoding for you

## Stability: unstable

[![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

## Thrift example

`thrift/service.thrift`:

```thrift
struct EchoResult {
    1: string value
}

service Echo  {
    EchoResult echo(
        1: string value
    )
}
```

`server.js:`

```js
var TChannelThrift = require('tchannel/as/thrift');
var TChannel = require('tchannel');
var fs = require('fs');
var path = require('path');

var server = TChannel({
    serviceName: 'server'
});
var client = TChannel();
var tchannelThrift = TChannelThrift({
    channel: client,
    source: fs.readFileSync(
        path.join(__dirname, 'thrift', 'service.thrift'), 'utf8'
    )
});

var context = {};

tchannelThrift.register(server, 'echo', context, echo);
function echo(context, req, head, body, callback) {
    callback(null, {
        ok: true,
        head: head,
        body: body
    });
}

server.listen(4040, '127.0.0.1', onListening);

function onListening() {
    tchannelThrift.request({
        serviceName: 'server',
        host: '127.0.0.1:4040'
    }).send('Echo::echo', {
        someHeader: 'headerValue'
    }, {
        value: 'some-string'
    }, onResponse);

    function onResponse(err, resp) {
        if (err) {
            console.log('got error', err);
        } else {
            console.log('got resp', resp);
        }

        server.close();
    }
}
```

### `var tchannelThrift = TChannelThrift(opts)`

`TChannelThrift` returns a `tchannelThrift` interface with a 
`.request()`, `.send()` and `.register()` method used to 
send call requests and register call request handlers

It can be passed options.

 - required `opts.source` The thrift idl as a string
 - `opts.logParseFailures` logParseFailures defaults to true. When
    it is set to true we will log parse failures to the logger using
    `logger.warn()`. If you do not want these log statements you
    can set the option to `false`
 - `opts.channel` The channel used to make requests on. This
    option is required if you want to use the `.request()` method or
    `opts.isHealthy` is passed in.
 - `opts.isHealthy` The callback function used to return the
   health check status of the service. The callback function should return
   an object that contains 1) a required field of `ok` that can be `true` or
   `false`; and 2) a field of `message` that indicates the reason for
   current status. `message` is required when `ok` is `false`.

### `tchannelThrift.request(reqOpts).send(endpoint, head, body, cb)`

You **MUST** pass in a `channel` option to `TChannelThrift()`
to use this method

The `.request()` method can be used to make an outgoing Thrift
request.

It returns an object with a `.send()` method used to send requests

This is just sugar for `tchannelThrift.send(...)`

### `tchannelThrift.send(req, endpoint, head, body, callback(err, response))`

The `.send()` method can be used to send to an outgoing request.

First you must use `tchannel.request(...)` to create an outgoing
request to send to.

 - `endpoint` is the name of thrift endpoint as `{Service}::{method}`
 - `head` is an object with string key value pairs that we serialize to arg2
 - `body` is an object that we will serialize as a thrift struct
 - `callback` takes two args; an error and a `response`. The response
    is an object with three fields; `ok`, `head` and `body`.
 - `response.ok` is the `ok` field from the call response.
 - `response.head` is an object with string key value pairs that is parsed from arg2
 - `response.body` is an object or error that we parsed from a thrift struct. If the response is ok then it's a struct; if the response is not
 ok then it's an error object.

### `tchannelThrift.register(tchannel, arg1, ctx, handlerFn)`

The `.register()` method can be used to register a call request
handler for a given `arg1`.

First you must pass in the `tchannel` you want to register on
as well as the `arg1`, i.e. method name you want to register.

The `ctx` argument will be passed to your `handlerFn` and can
be used for passing context around without creating closures.

The `handlerFn` takes five arguments, `(ctx, req, head, body, cb(err, response))`

 - `ctx` in the `handlerFn` will be the same `ctx` you specified
    in your `.register()` call. This is useful for passing context
    around.
 - `req` will be the incoming call request object from tchannel
 - `head` will be an object with string key value pairs that we parsed from arg2
 - `body` will be an object that we parsed from a thrift struct
 - `cb` takes two args; and error and a `response`. The response
    is an object with four fields; `ok`,` head`, `body`, `typeName`
 - `error` If you pass an error to the `cb` we will send a
    `UnexpectedError` error frame. This must NOT be used for normal
    operations. Any `error` passed to the `cb` will be considered
    an unexpected error and will be logged to the logger with
    `logger.error()`; i.e. it is a bug.
 - `response.ok` A boolean whether to return a call response that
    is ok or not.
 - `response.head` an object with string key value pairs that will be serialized to arg2
 - `response.body` If `response.ok` is true then this will be an 
    object that is serialized as a thrift struct to arg3.
    If `response.ok` is false then this must be an error that
    is serialized as a thrift exception to  arg3.
 - `response.typeName` if you respond with `response.ok` set as
    `false` you must specify a `typeName` to determine how
    the exception will be serialized. This `typeName` must match
    the name of your exception in the thrift specification
