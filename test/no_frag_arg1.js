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

var v2 = require('../v2');
var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('arg1 cannot be fragmented: incoming request', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    one.makeSubChannel({
        serviceName: 'server'
    }).register('foo', echoit);

    var client = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    var peer = two.peers.get(one.hostPort);
    peer.waitForIdentified(doTheTest);

    function doTheTest() {
        var conn = peer.getOutConnection();

        var req = client.request({
            hasNoParent: true,
            peer: peer
        });

        req.hookupCallback(check);

        conn.handler.pushFrame(new v2.Frame(req.id, new v2.CallRequest(
            v2.CallFlags.Fragment,         // flags
            100,                           // timeout
            v2.Tracing.emptyTracing,       // tracing
            'foo',                         // serviceName
            {'as': 'raw', 'cn': 'batman'}, // req.headers
            v2.Checksum.Types.None,        // checksum type
            ['arg1_part']                  // non-terminated arg1
        )));
    }

    function check(err, req, res) {
        assert.ok(err && err.isErrorFrame, 'expected error frame');
        assert.equal(err && err.codeName, 'BadRequest', 'expected BadRequest');
        assert.equal(err && err.message, 'arg1 must not be fragmented', 'expected cannot frag arg1 message');

        assert.end();
    }

    function echoit(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    }
});

allocCluster.test('arg1 cannot be fragmented: incoming response', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    one.makeSubChannel({
        serviceName: 'server'
    }).register('foo', brokenResponse);

    var client = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    var peer = two.peers.get(one.hostPort);
    peer.waitForIdentified(doTheTest);

    function doTheTest() {
        client
            .request({
                serviceName: 'server',
                hasNoParent: true,
                peer: peer,
                timeout: 10,
                headers: {'as': 'raw', 'cn': 'batman'}
            })
            .send('foo', 'bar', 'baz', check);
    }

    function check(err, req, res) {
        assert.equal(err && err.type, 'tchannel.arg1-fragmented', 'expected error type');
        assert.equal(err && err.message, 'arg1 must not be fragmented', 'expected cannot frag arg1 message');

        assert.end();
    }

    function brokenResponse(req, res, arg2, arg3) {
        var conn = req.connection;
        conn.handler.pushFrame(new v2.Frame(req.id, new v2.CallResponse(
            v2.CallFlags.Fragment,   // flags
            0,                       // code
            v2.Tracing.emptyTracing, // tracing
            {'as': 'raw'},           // req.headers
            v2.Checksum.Types.None,  // checksum type
            ['arg1_part']            // non-terminated arg1
        )));
        conn.onReqDone(req); // XXX: a bit coupled to implementation...
    }
});
