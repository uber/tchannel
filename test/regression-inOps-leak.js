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

var test = require('tape');

var allocCluster = require('./lib/alloc-cluster.js');

test('does not leak inOps', function t(assert) {
    var cluster = allocCluster(2, {
        timeoutCheckInterval: 100
    });

    var one = cluster.channels[0];
    var two = cluster.channels[1];

    one.register('/timeout', timeout);

    two.send({
        host: cluster.hosts[0],
        timeout: 100
    }, '/timeout', 'h', 'b', onTimeout);

    function onTimeout(err) {
        assert.ok(err);

        assert.equal(err.message, 'timed out');

        var peersOne = one.getPeers();
        var peersTwo = two.getPeers();

        assert.equal(peersOne.length, 1);
        assert.equal(peersTwo.length, 1);

        var inPeer = peersOne[0];
        var outPeer = peersTwo[0];

        assert.equal(inPeer.direction, 'in');
        assert.equal(outPeer.direction, 'out');

        setTimeout(function onTimeout() {
            assert.equal(Object.keys(inPeer.outOps).length, 0);
            assert.equal(Object.keys(outPeer.inOps).length, 0);

            assert.equal(Object.keys(inPeer.inOps).length, 0);
            assert.equal(Object.keys(outPeer.outOps).length, 0);

            cluster.destroy();
            assert.end();
        }, 200);
    }

    function timeout() {
        // do not call cb();
    }
});
