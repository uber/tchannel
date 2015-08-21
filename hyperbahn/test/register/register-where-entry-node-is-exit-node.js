'use strict';

/*

This test handles the edge case where we send a register
message to an Entry node that is ALSO our Exit node.

*/

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register with exit node', {
    size: 5
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];
    var steve = cluster.dummies[0];

    var serviceName = entryNode.ring.hashToHostPort(entryNode).service;

    cluster.sendRegister(steve, {
        serviceName: serviceName
    }, onRegister);

    function onRegister(err, resp) {
        assert.ifError(err);

        cluster.checkExitPeers(assert, {
            serviceName: serviceName,
            hostPort: steve.hostPort
        });

        var body = resp.body;

        assert.ok(body.connectionCount > 0 &&
            body.connectionCount <= 5);

        assert.end();
    }
});
