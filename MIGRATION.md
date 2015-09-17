# Migration

# Upgrading from 2.x to 3.x

This is a pretty easy upgrade. We removed `test/lib/hyperbahn-cluster.js`

It's now recommended that you `npm install hyperbahn --save-dev` and import
`require('hyperbahn/test/lib/test-cluster.js')` instead.

The interface is the same.

# Upgrading from 1.x to 2.x

## .register() -> .handler.register()

Before:

```js
chan.register('my-endpoint', function (arg2, arg3, hi, cb) {
    // either
    cb(new Error('oops'));

    // or
    cb(null, 'res1', 'res2');
})
```

After:

```js
var TChannel = require('tchannel');

var server = TChannel();
var appChan = server.makeSubChannel({
    serviceName: 'my-app'
});

appChan.register('my-endpoint', function (req, res, arg2, arg3) {
    // req.remoteAddr

    // either
    res.headers.as = 'raw';
    res.sendNotOk(null, 'oops');

    // or
    res.headers.as = 'raw';
    res.sendOk('res1', 'res2');
});
```

If your server is JSON or Thrift consider using `as/json` or
`as/thrift` to handle encoding & decoding.

## .send() -> .request().send()

Before:

```js
chan
    .send(options, a1, a2, a3, function (err, res1, res2) {
        // CallResponse error is in `err`
        // CallResponse ok is in `res1`, `res2`
    });
```

After:

```js
var TChannel = require('tchannel');

var client = TChannel();
var appChane = client.makeSubChannel({
    serviceName: 'my-app',
    peers: ['{host}:{port}'],
    requestDefaults: {
        headers: {
            'as': 'raw',
            'cn': 'my-client-name'
        }
    }
});

chan
    .request({
        parent: inRequest
        /* ... */
    })
    .send(a1, a2, a3, function (err, res, arg2, arg3) {
        // res has an `.ok` field that tells whether it is
        // an error or not.

        // This means that an application error returns
        // `err` === null and a `resp` where `.ok` is false.

        // If `err` is non null then it will be an err related
        // to client TCP IO errors or TChannel error frames.
    });
```
