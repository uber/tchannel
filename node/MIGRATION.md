# Migration

# Upgrading from 1.x to 2.x

## .register() -> .handler.register()

Before:

```
chan.register('my-endpoint', function (arg2, arg3, hi, cb) {
    // either
    cb(new Error('oops'));

    // or
    cb(null, 'res1', 'res2');
})
```

After:

```
var TChannel = require('tchannel');
var EndpointHandler = require('tchannel/endpoint-handler');

var chan = TChannel({
    handler: EndpointHandler()
});

chan.handler.register('my-endpoint', function (req, res) {
    // req.arg2, req.arg3, req.remoteAddr

    // either
    res.sendNotOk(null, 'oops');

    // or
    res.sendOk(null, 'res1', 'res2');
});
```

## .send() -> .request().send()

Before:
```
chan
    .send(options, a1, a2, a3, function (err, res1, res2) {
        // CallResponse error is in `err`
        // CallResponse ok is in `res1`, `res2`
    });
```

After (simple):
```
chan
    .request(options)
    .send(a1, a2, a3, function (err, res) {
        // CallResponse is in `res.arg2`, `res.arg3`
        // res has an `.ok` field that is tells whether it is
        // an error or not.

        // `err` is for IO & timeouts. Also tchannel error frames
    });
```

After (if needed/useful):
```
chan
    .request(options)
    .on('error', function onError(err) {
        console.error('too bad:', err);
    })
    .on('response', function onResponse(res) {
        console.log('got:', res.arg2, res.arg3);
    })
    .send(a1, a2, a3);
```
