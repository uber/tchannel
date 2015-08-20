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
var CountedReadySignal = require('ready-signal/counted');

var setTimeout = require('timers').setTimeout;

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('end response with error frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var client = cluster.channels[0];
    var server = cluster.channels[1];

    server.makeSubChannel({
        serviceName: 'stream'
    }).register('stream', {
        streamed: true
    }, streamHandler);

    var subChan = client.makeSubChannel({
        serviceName: 'stream',
        peers: [server.hostPort]
    });

    var peers = client.peers.values();
    var ready = new CountedReadySignal(peers.length);
    peers.forEach(function each(peer) {
        peer.connect().on('identified', ready.signal);
    });
    ready(function send() {
        var req = subChan.request({
            serviceName: 'stream',
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: 'wat'
            },
            timeout: 1000,
            streamed: true
        });

        req.arg1.end('stream');
        req.arg2.end();
        req.arg3.end();

        req.on('response', onResponse);
        req.on('error', onError);
    });

    function onResponse(resp) {
        assert.ok(resp);

        resp.on('finish', onResponseFinished);
        resp.on('error', onResponseError);

        function onResponseFinished() {
            assert.ok(false, 'expected no finished event');
        }

        function onResponseError(err) {
            assert.equal(err.message, 'oops');

            assert.end();
        }
    }

    function onError(err) {
        assert.equal(err && err.type, 'tchannel.unexpected', 'expected an UnexpectedError');
        assert.equal(err && err.message, 'oops', 'expected "oops"');
    }

    function streamHandler(inreq, buildRes) {
        var res = buildRes({
            streamed: true
        });

        res.headers.as = 'raw';
        res.arg1.end();
        res.arg2.end();

        res.arg3.write('a message');

        setTimeout(function datTime() {
            res.sendError('UnexpectedError', 'oops');
        }, 500);
    }
});
