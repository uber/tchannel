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

chan.handler.register('my-endpoint', function (req, res, arg2, arg3) {
    // req.remoteAddr

    // either
    res.sendNotOk(null, 'oops');

    // or
    res.sendOk('res1', 'res2');
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
    .send(a1, a2, a3, function (err, res, arg2, arg3) {
        // res has an `.ok` field that tells whether it is
        // an error or not.

        // This means that an application error returns
        // `err` === null and a `resp` where `.ok` is false.

        // If `err` is non null then it will be an err related
        // to client TCP IO errors or TChannel error frames.
    });
```

After (sync send w/ streaming callback):
```
function onResponse(err, res) {
    if (err) {
        console.error('too bad:', err);
    } else {
        res.arg2.on('data', function onArg2Data(chunk) {...});
        res.arg3.on('data', function onArg3Data(chunk) {...});
        res.arg2.on('end', function onArg2End(chunk) {...});
        res.arg3.on('end', function onArg3End(chunk) {...});
    }
}
onResponse.canStream = true;
chan
    .request(options)
    .send(a1, a2, a3, onResponse);
```

After (full streaming):
```
var req = chan
    .request(options)
    .on('error', function onError(err) {
        console.error('too bad:', err);
    })
    .on('response', function onResponse(res) {
        res.arg2.on('data', function onArg2Data(chunk) {...});
        res.arg3.on('data', function onArg3Data(chunk) {...});
        res.arg2.on('end', function onArg2End(chunk) {...});
        res.arg3.on('end', function onArg3End(chunk) {...});
    });
req.arg1.end(a1);

req.arg2.write(someArg2);
req.arg2.write(moarArg2);
req.arg2.end();

req.arg3.write(someArg3);
req.arg3.write(moarArg3);
req.arg3.end();
```
