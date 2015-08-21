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

/* Given a cluster of two.

 - Find a shard key that hashes to exitNode (node 1)
 - Force exitNode ringpop to not own shard key
 - sendRegister() to entryNode (node 0).
 - Expect error from entry node

*/
allocCluster.test('register with ringpop divergence', {
    size: 5
}, function t(cluster, assert) {
    assert.timeoutAfter(2000);

    var entryNode = cluster.apps[0];
    var exitNode = cluster.apps[1];

    var service = entryNode.ring.hashToHostPort(exitNode).service;
    exitNode.ring.forceNonOwnership(service + '~1');

    cluster.sendRegister(cluster.dummies[0], {
        serviceName: service,
        host: entryNode.hostPort
    }, function onResponse(err, resp) {
        if (err) {
            assert.ifError(err);
            return assert.end();
        }

        cluster.checkExitPeers(assert, {
            serviceName: service,
            hostPort: cluster.dummies[0].hostPort,
            blackList: [exitNode.hostPort]
        });

        assert.equal(typeof resp.body.connectionCount, 'number');

        assert.end();
    });
});
