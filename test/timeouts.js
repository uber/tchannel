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
var TimeMock = require('time-mock');

var allocCluster = require('./lib/alloc-cluster.js');

test('requests will timeout', function t(assert) {
    var timers = TimeMock(Date.now());
    var cluster = allocCluster(2, {
        timers: timers
    });
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];

    one.register('/normal-proxy', normalProxy);
    one.register('/timeout', timeout);

    two.send({
        host: hostOne,
        timeout: 1000
    }, '/normal-proxy', 'h', 'b', function onResp(err, h, b) {
        assert.ifError(err);

        assert.equal(String(h), 'h');
        assert.equal(String(b), 'b');

        two.send({
            host: hostOne,
            timeout: 1000
        }, '/timeout', 'h', 'b', onTimeout);
        timers.advance(2500);
    });

    function onTimeout(err) {
        assert.ok(err);
        assert.equal(err.message, 'timed out');
        cluster.destroy(assert.end);
    }

    function normalProxy(head, body, hostInfo, cb) {
        cb(null, head, body);
    }
    function timeout(/* head, body, hostInfo, cb */) {
        // do not call cb();
    }
});
