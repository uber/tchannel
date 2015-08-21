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

allocCluster.test('forwarding small timeout concurrently', {
    size: 5,
    serviceReqDefaults: {
        tcollector2: {
            retryLimit: 1
        }
    },
    namedRemotes: ['tcollector2', 'tcollector2', 'tcollector2']
}, function t(cluster, assert) {
    cluster.logger.whitelist('warn', 'forwarding error frame');

    var bob = cluster.remotes.bob;

    var fooCounter = 0;

    var tcollector0 = cluster.namedRemotes[0];
    var tcollector1 = cluster.namedRemotes[1];
    var tcollector2 = cluster.namedRemotes[2];

    tcollector0.serverChannel.register('foo', foo);
    tcollector1.serverChannel.register('foo', foo);
    tcollector2.serverChannel.register('foo', foo);

    bob.clientChannel.request({
        serviceName: 'tcollector2',
        retryLimit: 1
    }).send('foo', '', '', onResponse);

    function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.message, 'unexpected error');

        var lines = cluster.logger.items();
        assert.ok(lines.length >= 1);
        assert.equal(lines[0].meta.error.type, 'tchannel.unexpected');

        assert.end();
    }

    function foo(req, res) {
        fooCounter++;

        res.sendError('UnexpectedError', 'unexpected error');
    }
});
