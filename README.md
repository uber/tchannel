# TChannel

network multiplexing and framing protocol for RPC

## Stability: experimental

NOTE: `master:node` is **not yet stable**

Once we have completed an API that implements all of the v2 protocol, we will
cut the first `node-v2*` tag.  Until then, we are not publishing to npm and the
package.json version will not be updated.

Status is being tracked in #78.

## Example

```js
var TChannel = require('tchannel');
var EndpointHandler = require('tchannel/endpoint-handler');
var CountedReadySignal = require('ready-signal/counted');

var server = new TChannel({
    handler: EndpointHandler()
});
var client = new TChannel();

// normal response
server.handler.register('func 1', function (req, res) {
    console.log('func 1 responding immediately 1:' + req.arg2.toString() + ' 2:' + req.arg3.toString());
    res.sendOk('result', 'indeed it did');
});
// err response
server.handler.register('func 2', function (req, res) {
    res.sendNotOk(null, 'it failed');
});

var ready = CountedReadySignal(2);
var listening = ready(function (err) {
    if (err) {
        throw err;
    }

    client
        .request({host: '127.0.0.1:4040'})
        .send('func 1', "arg 1", "arg 2", function (err, res) {
            console.log('normal res: ' + res.arg2.toString() + ' ' + res.arg3.toString());
        });
    client
        .request({host: '127.0.0.1:4040'})
        .send('func 2', "arg 1", "arg 2", function (err, res) {
            console.log('err res: ' + res.ok + 
                ' message: ' + String(res.arg3));
        });

});

server.listen(4040, '127.0.0.1', ready.signal);
client.listen(4041, '127.0.0.1', ready.signal);
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

 - [example1.js](examples/example1.js)
 - [example2.js](examples/example2.js)

## Installation

`npm install tchannel`

## Tests

`npm test`

## Contributors

 - mranney
 - jwolski
 - Raynos
 - jcorbin

## MIT Licenced
