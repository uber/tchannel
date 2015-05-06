# as/json and as/thrift

The following is documentation on how to use the `as` implementation
to handle encoding and decoding for you

## JSON example

```js
var TChannelJSON = require('tchannel/as/json');
var TChannel = require('tchannel');

var server = TChannel({
    serviceName: 'server'
});
var client = TChannel();
var tchannelJSON = TChannelJSON();

var context = {};

tchannelJSON.register(server, 'echo', context, echo);
function echo(context, req, head, body, callback) {
    callback(null, {
        ok: true,
        head: head,
        body: body
    });
}

server.listen(4040, '127.0.0.1', onListening);

function onListening() {
    tchannelJSON.send(client.request({
        serviceName: 'server',
        host: '127.0.0.1:4040'
    }), 'echo', {
        head: 'object'
    }, {
        body: 'object'
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

## JSON documentation

```jsig
type JSONSerializable : Any

type JSONResponse : {
    ok: Boolean,
    head: JSONSerializable,
    body: JSONSerializable
}

type TChannelJSONHandler<T> : (
    opts: T,
    req: TChannelInRequest,
    head: JSONSerializable,
    body: JSONSerializable,
    callback: Callback<Error, JSONResponse>
) => void

type TChannelJSON : {
    send: (
        req: TChannelRequest,
        endpoint: String,
        head: JSONSerializable,
        body: JSONSerializable,
        callback: Callback<Error, JSONResponse>
    ) => void,
    register: (
        tchannel: TChannel,
        arg1: String,
        opts: T,
        handler: TChannelJSONHandler<T>
    ) => void
}

tchannel/as/json : ({
    logger?: Object,
    strictMode?: Boolean,
    logParseFailures?: Boolean
}) => TChannelJSON
```

### `var tchannelJSON = TChannelJSON(opts)`

`TChannelJSON` returns a `tchannelJSON` interface with a 
`.send()` and `.register()` method used to send call requests
and register call request handlers

It can be passed options.

 - `opts.logger` is a logger passed in. `TChannelJSON` writes
    a series of log warnings and errors under various JSON
    serialization failures.
 - `opts.strictMode` strictMode defaults to true. When strictMode
    is set to true we enforce that a not ok response from a handler
    must have the body set to an instance of `TypedError` rather
    then arbitary response.
 - `opts.logParseFailures` logParseFailures defaults to true. When
    it is set to true we will log parse failures to the logger using
    `logger.warn()`. If you do not want these log statements you
    can set the option to `false`

### `tchannelJSON.send(req, endpoint, head, body, callback)`

The `.send()` method can be used to send to an outgoing request.

First you must use `tchannel.request(...)` to create an outgoing
request to send to.

 - `endpoint` is arg1 as a string for the call request.
 - `head` is an arbitrary value that will be JSON serialized to arg2
 - `body` is an arbitrary value that will be JSON serialized to arg3
 - `callback` takes two args; an error and a `response`. The response
    is an object with three fields; `ok`, `head` and `body`.
 - `response.ok` is the `ok` field from the call response.
 - `response.head` is an arbitrary value that was JSON parsed from arg2
 - `response.body` is an arbitrary value that was JSON parsed from arg3

### `tchannelJSON.register(tchannel, arg1, opts, handlerFn)`

The `.register()` method can be used to register a call request
handler for a given `arg1`.

First you must pass in the `tchannel` you want to register on
as well as the `arg1`, i.e. method name you want to register.

The `opts` argument will be passed to your `handlerFn` and can
be used for passing context around without creating closures.

The `handlerFn` takes five arguments, `(opts, req, head, body, cb)`

 - `opts` in the `handlerFn` will be the same `opts` you specified
    in your `.register()` call. THis is useful for passing context
    around.
 - `req` will be the incoming call request object from tchannel
 - `head` will be an arbitrary object that is JSON parsed from arg2
 - `body` will be an arbitrary object that is JSON parsed from arg3
 - `cb` takes two args; and error and a `response`. The response
    is an object with three fields; `ok`,` head`, `body`
 - `error` If you pass an error to the `cb` we will send a
    `UnexpectedError` error frame. This must NOT be used for normal
    operations. Any `error` passed to the `cb` will be considered
    an unexpected error and will be logged to the logger with
    `logger.error()`; i.e. it is a bug.
 - `response.ok` A boolean whether to return a call response that
    is ok or not.
 - `response.head` An arbitrary value that will be JSON serialized
    to arg2.
 - `response.body` If `response.ok` is true then this is an
    arbitrary value taht will be JSON serialized to arg3. If
    `response.ok` is false then this must be an error object that
    will be serialized to arg3.

If you want to send a not ok call response with arbitrary arg3
response you must turn `strictMode` off in the `TChannelJSON`
constructor.
