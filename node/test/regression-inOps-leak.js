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

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('does not leak inOps', {
    numPeers: 2,
    channelOptions: {
        timeoutCheckInterval: 100,
        serverTimeoutDefault: 100,
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    one.makeSubChannel({
        serviceName: 'server'
    }).register('/timeout', timeout);

    two.timeoutCheckInterval = 99999;
    subTwo
        .request({
            serviceName: 'server',
            hasNoParent: true,
            timeout: 100
        })
        .send('/timeout', 'h', 'b', onTimeout);

    function onTimeout(err) {
        var type = err && err.type;
        assert.ok(
            type === 'tchannel.request.timeout' ||
            type === 'tchannel.timeout',
            'expected timeout error'
        );

        // Force the server to reap in operations
        setTimeout(function checkState() {
            cluster.assertEmptyState(assert);
            assert.end();
        }, 150);
    }

    function timeout() {
        // do not call cb();
    }
});
