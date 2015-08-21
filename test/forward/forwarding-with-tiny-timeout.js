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

var setTimeout = require('timers').setTimeout;

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forwarding small timeout', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    cluster.checkExitPeers(assert, {
        serviceName: 'steve',
        hostPort: steve.hostPort
    });

    steve.serverChannel.register('method', function m(req, res) {
        // long delay
        setTimeout(function sendStuff() {
            res.headers.as = 'raw';
            res.sendOk(null, 'oh hi');
        }, 500);
    });

    bob.clientChannel.request({
        serviceName: steve.serviceName,
        timeout: 300
    }).send('method', null, null, onFirst);

    function onFirst(err) {
        assert.ok(err, 'first request should time out');

        bob.clientChannel.request({
            serviceName: steve.serviceName,
            timeout: 600
        }).send('method', null, null, onSecond);
    }

    function onSecond(err, res, arg2, arg3) {
        assert.ifError(err, 'second request should succeed');

        assert.ok(res && res.ok);

        assert.equal(String(arg3), 'oh hi');

        assert.end();
    }
});
