# TChannel as handlers.

The `as` handlers are a high level interface for sending
and receiving messages over tchannel with non-buffer encoding.

There are currently two `as` handlers, `json` and `thrift`. 
Each one sets the `as` transport header to their respective type.

## as send interface

To make requests to a `json` or `thrift` service using the
tchannel request interface looks like.

```js
tchannel
    .request({
        serviceName: 'foo',
        timeout: 1000
    })
    .send(
        Encoder.stringify(arg1),
        Encoder.stringify(arg2),
        Encoder.stringify(arg3),
        function onResponse(err, resp) {
            if (err) {
                console.log('got error', {
                    error: err
                })
                return;
            }

            if (!resp.ok) {
                console.log('resp not ok', {
                    arg2: Encoder.parse(resp.arg2),
                    arg3: Encoder.parse(resp.arg3)
                });
                return;
            }

            console.log('resp ok', {
                arg2: Encoder.parse(resp.arg2),
                arg3: Encoder.parse(resp.arg3)
            });
        }
    );
```

The `as` client interface can be made simpler then this.

The proposed interface is modeled after `request/request` which
is a popular HTTP client with a simpler interface.

```js
var TChannelJSON = require('tchannel/as/json');
var tchannelJSON = TChannelJSON({
    logger: ...
});

tchannelJSON.send(tchannel.request({
    timeout: 1000,
    serviceName; 'foo'
}), {
    endpoint: arg1,
    head: arg2,
    body: arg3
}, function onResponse(err, resp) {
    if (err) {
        console.log('got error from remote', {
            error: err
        });
        return;
    }

    if (!resp.ok) {
        console.log('got not ok from remote', {
            error: resp.body
        })
        return;
    }

    console.log('got resp ok', {
        head: resp.head,
        body: resp.body
    })
})
```

Proposed simplifications: 

 - a single options argument instead of 4 positional arguments
 - response callback has only two args so works with `async` library
 - handles encoding & decoding for you.
 - rename `arg1`, `arg2`, `arg3` to something else. Currently
    renamed to `endpoint`, `head`, `body`.
 - mandatory `serviceName`.
 - mandatory `timeout`.
 - rename `res.arg1`, `res.arg2`,` res.arg3` to something else.
    Currently `res.endpoint`, `res.head`, `res.body`

The end user only has to concern himself with making a request
and getting a response. This as interface is simplified to 
assume no streaming. All current as handlers have no streaming.

For future streaming support we may want something like

```js
var TChannelJSON = require('tchannel/as/json');
var tchannelJSON = TChannelJSON({
    logger: ...
});

var req = tchannelJSON.sendStream(tchannel.request({
    timeout: 1000,
    serviceName: 'foo'
}));

req.body.write({ some: 'object' });

req.on('error', function onError(err) {
    
});

req.on('response', function onResponse(resp) {
    console.log('ok?', resp.ok);
    resp.body.on('data', function (obj) {
        ...
    })
});
```

We do not have to concern ourselves with streaming today. But
we can future proof support for it without adding complexity to
the simple req / res case.

## as handle interface

To handle requests with `json` or `thrift` service using the
tchannel register interface looks like

```js
tchannel.handler.register('arg1', function (req, res, arg2, arg3) {
    arg2 = Encoder.parse(arg2);
    arg3 = Encoder.parse(arg3);

    // code()

    // for the ok path
    res.sendOk(
        Encoder.stringify(res1),
        Encoder.stringify(res2)
    );

    // for the not ok path
    res.sendNotOk(
        Encoder.stringify(res1),
        Encoder.stringify(res2)
    );

    // for the error path
    res.sendErrorFrame('BadRequest', res2);
});
```

The proposed interface is as followes:

```js
var TChannelJSON = require('tchannel/as/json');
var tchannelJSON = TChannelJSON({
    logger: ...
});

var handler = tchannelJSON.createHandle(function foo(req, opts, cb) {
    var head = req.head;
    var body = req.body;

    // code()

    // for the ok path
    cb(null, {
        ok: true,
        head: res1,
        body: res2
    });

    // for the not ok path
    cb(null, {
        ok: false,
        head: res1,
        body: errObj
    });

    // for the error path
    cb(someErr);
}, opts);
tchannel.handler.register('arg1', handler);
```

Proposed simplifications:

 - handles encoding and decoding for you
 - handler has symmetry with the client. The `err, resp` in cb
    is the same shape as the `cb` in the client
 - rename `arg1`, `arg2`, `arg3` to something else. Currently
    renamed to `endpoint`, `head`, `body`.
 - rename `res1`, `res2` to something else. Currently
    renamed to `head`, `body`.
 - enforce that `arg3` for not ok is an error object.
 - `cb` interface forces a unified serialization code for writing
    error response of all kinds.
 - threads through an `opts` object to support dependency
    injection.

The end user only has to concern himself with getting an incoming
request and returning a response in the callback.

Supporting streaming handlers in thie as handler interface is
currently out of scope but can be thought about later.
