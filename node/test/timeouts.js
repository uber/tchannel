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

var TimeMock = require('time-mock');
var allocCluster = require('./lib/alloc-cluster.js');
var timers = TimeMock(Date.now());

var EndpointHandler = require('../endpoint-handler');

allocCluster.test('requests will timeout', 2, {
    timers: timers
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];

    one.handler = EndpointHandler();

    one.handler.register('/normal-proxy', normalProxy);
    one.handler.register('/timeout', timeout);

    two
        .request({
            host: hostOne,
            timeout: 1000
        })
        .send('/normal-proxy', 'h', 'b', onResp);

    function onResp(err, res) {
        assert.ifError(err);

        assert.equal(String(res.arg2), 'h');
        assert.equal(String(res.arg3), 'b');

        two
            .request({
                host: hostOne,
                timeout: 1000
            })
            .send('/timeout', 'h', 'b', onTimeout);

        timers.advance(2500);
    }

    function onTimeout(err) {
        assert.equal(err && err.message, 'timed out', 'expected timeout error');

        var peersOne = one.getPeers();
        var peersTwo = two.getPeers();

        assert.equal(peersOne.length, 1, 'one should have 1 peer');
        assert.equal(peersTwo.length, 1, 'two should have 1 peer');

        var inPeer = peersOne[0];
        if (inPeer) {
            assert.equal(inPeer.direction, 'in', 'inPeer should be in');
            inPeer.onTimeoutCheck();
            assert.equal(Object.keys(inPeer.inOps).length, 0, 'inPeer should have no inOps');
            assert.equal(Object.keys(inPeer.outOps).length, 0, 'inPeer should have no outOps');
        }

        var outPeer = peersTwo[0];
        if (outPeer) {
            assert.equal(outPeer.direction, 'out', 'outPeer should be out');
            assert.equal(Object.keys(outPeer.inOps).length, 0, 'outPeer should have no inOps');
            assert.equal(Object.keys(outPeer.outOps).length, 0, 'outPeer should have no outOps');
        }

        assert.end();
    }

    function normalProxy(req, res) {
        res.send(null, req.arg2, req.arg3);
    }
    function timeout(/* head, body, hostInfo, cb */) {
        // do not call cb();
    }
});
