// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var assert = require('assert');
var parseArgs = require('minimist');
var TChannel = require('../channel');
var TChannelAsHTTP = require('../as/http');

/* Minimal working example of an HTTP "bridge" over TChannel:
 * 1) start an http service:
 *    $ python -m SimpleHTTPServer # listens on port 8000
 *
 * 2) start an ingress proxy which will convert TChannel calls to http requests:
 *    $ node examples/http_ingress.js --tchannel-port 4040 example 127.0.0.1:8000
 *
 * 3) start an egress proxy which will convert HTTP requests to TChannel calls:
 *    $ node examples/http_egress.js --http-port 8080 --peers 127.0.0.1:4040 example
 *
 * 4) use it through the egress node:
 *    $ curl http://localhost:8080 # or open in browser to taste
 */

var argv = parseArgs(process.argv.slice(2), {
    default: {
        bind: '127.0.0.1',
        tchannelPort: 0
    },
    alias: {
        'tchannel-port': 'tchannelPort'
    }
});

function usage() {
    console.error('usage http_relay [options] <serviceName> <dest>');
    console.error('\nOptions:');
    console.error('  --bind <address>');
    console.error('  --tchannel-port <port>');
    process.exit(1);
}

if (argv._.length !== 2) usage();

var serviceName = argv._[0];
var dest = argv._[1];
var parts = dest.split(':');
assert(parts.length === 2);

var destHost = parts[0];
var destPort = parts[1];

var asHTTP = TChannelAsHTTP();

var tchan = TChannel();
tchan.listen(argv.tchannelPort, argv.bind, onChannelListening);

var svcChan = tchan.makeSubChannel({
    serviceName: serviceName
});
asHTTP.setHandler(svcChan, onRequest);

function onChannelListening() {
    var addr = tchan.address();
    console.log('tchannel listening on %s:%s', addr.address, addr.port);
}

function onRequest(inreq, outres) {
    asHTTP.forwardToHTTP(svcChan, {
        host: destHost,
        port: destPort,
    }, inreq, outres, function(error) {
        if (error) {
            console.log('forward to http failed', error);
        }
    });
}
