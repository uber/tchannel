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

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register and forward', {
    size: 5,
    namedRemotes: ['mary', 'mary', 'mary']
}, function t(cluster, assert) {
    cluster.logger.whitelist('warn', 'forwarding error frame');

    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    var maries = cluster.namedRemotes;

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });
    var counter = 0;

    for (var i = 0; i < maries.length; i++) {
        var mary = maries[i];
        mary.serverChannel.register('ping', ping);
    }

    bob.clientChannel.request({
        serviceName: maries[0].serviceName,
        retryFlags: {
            never: true
        }
    }).send('ping', null, JSON.stringify('oh hi lol'), onForwarded);

    function ping(req, res) {
        counter++;
        res.sendError('UnexpectedError', 'oops');
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err);
        assert.equal(err.message, 'oops');

        assert.equal(counter, 1);

        var logs = cluster.logger.items();
        assert.equal(logs.length, 1);
        assert.equal(logs[0].levelName, 'warn');
        assert.equal(logs[0].meta.serviceName, 'mary');
        assert.equal(logs[0].meta.callerName, 'bob');
        assert.equal(logs[0].meta.error.message, 'oops');

        assert.end();
    }
});
