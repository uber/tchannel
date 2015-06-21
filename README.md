# TChannel

network multiplexing and framing protocol for RPC

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

## Example

```js
var TChannel = require('tchannel');

var server = new TChannel();
var client = new TChannel();

var serverChan = server.makeSubChannel({
    serviceName: 'server'
});

// normal response
serverChan.register('func1', function onReq(req, res, arg2, arg3) {
    console.log('func1 responding', { arg2: arg2.toString(), arg3: arg3.toString() });
    res.headers.as = 'raw';
    res.sendOk('result', 'indeed it did');
});

// err response
serverChan.register('func2', function onReq2(req, res) {
    res.headers.as = 'raw';
    res.sendNotOk(null, 'it failed');
});

server.listen(4040, '127.0.0.1', function onListen() {
    var clientChan = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort],
        requestDefaults: {
            hasNoParent: true,
            headers: { 'as': 'raw', 'cn': 'example-client' }
        }
    });

    clientChan.request({
        serviceName: 'server',
        timeout: 1000
    }).send('func1', 'arg 1', 'arg 2', function onResp(err, res, arg2, arg3) {
        console.log('normal res:', { arg2: arg2.toString(), arg3: arg3.toString() });
    });

    clientChan.request({
        serviceName: 'server'
    }).send('func2', 'arg 1', 'arg 2', function onResp(err, res, arg2, arg3) {
        console.log('err res: ', { ok: res.ok, message: String(arg3) });
    });
});
```

This example registers two functions on the "server". "func 1" always works and "func 2" always
returns an error. The client sends a request for each function, then prints the result.

Note that every instance is bidirectional. New connections are initiated on demand.

## Overview

TChannel is a network protocol with the following goals:

 * request / response model
 * multiple requests multiplexed across the same TCP socket
 * out of order responses
 * streaming request and responses
 * all frames checksummed
 * transport arbitrary payloads
 * easy to implement in multiple languages
 * near-redis performance

This protocol is intended to run on datacenter networks for inter-process communication.

## Protocol

TChannel frames have a fixed length header and 3 variable length fields. The underlying protocol
does not assign meaning to these fields, but the included client/server implementation uses
the first field to represent a unique endpoint or function name in an RPC model.
The next two fields can be used for arbitrary data. Some suggested way to use the 3 fields are:

* URI path, HTTP method and headers as JSON, body
* function name, headers, thrift / protobuf

Note however that the only encoding supported by TChannel is UTF-8.  If you want JSON, you'll need
to stringify and parse outside of TChannel.

This design supports efficient routing and forwarding of data where the routing information needs
to parse only the first or second field, but the 3rd field is forwarded without parsing.

There is no notion of client and server in this system. Every TChannel instance is capable of
making or receiving requests, and thus requires a unique port on which to listen. This requirement may
change in the future.

 - See [protocol.md](../docs/protocol.md) for more details

## Performance

On a Macbook Pro, we see around 50,000 ops/sec from a single node process talking to one other node process.

## Documentation

See the [docs](./docs/) folder.

## Further examples

See the [examples](./examples/) folder

## Installation

`npm install tchannel`

## Tests

`npm test`

## Contributors

 - mranney
 - jwolski
 - Raynos
 - jcorbin
 - kriskowal
 - shannili
 - rf

## MIT Licenced
