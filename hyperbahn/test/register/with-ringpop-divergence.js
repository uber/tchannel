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
