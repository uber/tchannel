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

The proposed interface is as follows:

```js
var TChannelJSON = require('tchannel/as/json');
var tchannelJSON = TChannelJSON({
    logger: ...
});

tchannelJSON.send(tchannel.request({
    timeout: 1000,
    serviceName; 'foo'
}), arg1, arg2, arg3, function onResponse(err, resp, head, body) {
    if (err) {
        console.log('got error from remote', {
            error: err
        });
        return;
    }

    if (!resp.ok) {
        console.log('got not ok from remote', {
            error: body
        })
        return;
    }

    console.log('got resp ok', {
        head: head,
        body: body
    })
})
```

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

The proposed interface is as follows:

```js
var TChannelJSON = require('tchannel/as/json');
var tchannelJSON = TChannelJSON({
    logger: ...
});

var handler = tchannelJSON.register(tchannel, 'arg1', opts,
    function foo(opts, req, head, body, cb) {
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
    });
```
