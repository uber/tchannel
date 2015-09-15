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

var parseArgs = require('minimist');
var http = require('http');
var TChannel = require('../channel');
var TChannelAsHTTP = require('../as/http');

var argv = parseArgs(process.argv.slice(2), {
    default: {
        bind: '127.0.0.1',
        httpPort: 0,
        tchannelPort: 0
    },
    alias: {
        'tchannel-port': 'tchannelPort',
        'http-port': 'httpPort'
    }
});

function usage() {
    console.error('usage http_relay [options] <serviceName>');
    console.error('\nOptions:');
    console.error('  --bind <address> (default: 127.0.0.1)');
    console.error('  --http-port <port> (default: 0)');
    console.error('  --tchannel-port <port> (default: 0)');
    console.error('  --peers <host:port>[,<host:port>[,...]]');
    console.error('  --streamed (default false)');
    process.exit(1);
}

if (argv._.length !== 1) usage();

var serviceName = argv._[0];

var asHTTP = TChannelAsHTTP();

var tchan = TChannel();
tchan.listen(argv.tchannelPort, argv.bind, onChannelListening);

var httpServer = http.createServer(onHTTPRequest);
httpServer.listen(argv.httpPort, argv.bind, onHTTPListening);

var svcChan = tchan.makeSubChannel({
    serviceName: serviceName,
    requestDefaults: {
        serviceName: serviceName,
        headers: {
            cn: 'examples/http_ingress'
        }
    }
});

if (argv.peers) {
    argv.peers.split(/\s*,\s*/).forEach(function each(hostPort) {
        var peer = svcChan.peers.add(hostPort);
        console.log('added peer', peer.hostPort);
    });
}

function onChannelListening() {
    var addr = tchan.address();
    console.log('tchannel listening on %s:%s', addr.address, addr.port);
}

function onHTTPListening() {
    var addr = httpServer.address();
    console.log('http listening on %s:%s', addr.address, addr.port);
}

function onHTTPRequest(hreq, hres) {
    asHTTP.forwardToTChannel(svcChan, hreq, hres, {
        streamed: argv.streamed
    }, function onComplete(error) {
        if (error) {
            console.error('forward to tchannel failed', error);
        }
    });
}
