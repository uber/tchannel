# TChannel

network multiplexing and framing protocol for RPC

## Example

```js
var TChannel = require('tchannel');

var server = new TChannel({host: '127.0.0.1', port: 4040});
var client = new TChannel({host: '127.0.0.1', port: 4041});

// normal response
server.register('func 1', function (arg1, arg2, peerInfo, cb) {
    console.log('func 1 responding immediately 1:' + arg1.toString() + ' 2:' + arg2.toString());
    cb(null, 'result', 'indeed it did');
});
// err response
server.register('func 2', function (arg1, arg2, peerInfo, cb) {
    cb(new Error('it failed'));
});
client.send({host: '127.0.0.1:4040'}, 'func 1', "arg 1", "arg 2", function (err, res1, res2) {
    console.log('normal res: ' + res1.toString() + ' ' + res2.toString());
});
client.send({host: '127.0.0.1:4040'}, 'func 2', "arg 1", "arg 2", function (err, res1, res2) {
    console.log('err res: ' + err.message);
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

This design supports efficient routing and forwarding of data where the routing information needs
to parse only the first or second field, but the 3rd field is forwarded without parsing.

There is no notion of client and server in this system. Every TChannel instance is capable of 
making or receiving requests, and thus requires a unique port on which to listen. This requirement may
change in the future.

## Performance

On a Macbook Pro, we see around 50,000 ops/sec from a single node process talking to one other node
process.

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

## MIT Licenced
