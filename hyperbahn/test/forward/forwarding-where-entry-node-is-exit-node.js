'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forward where entry node is exit node', {
    size: 5
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];
    var serviceName = entryNode.ring
        .hashToHostPort(entryNode).service;
    var bob = cluster.remotes.bob;

    var mary = cluster.createRemote({
        serviceName: serviceName
    }, onRegistered);

    function onRegistered(err) {
        assert.ifError(err);

        cluster.checkExitPeers(assert, {
            serviceName: serviceName,
            hostPort: mary.hostPort
        });

        bob.clientChannel.request({
            serviceName: serviceName
        }).send('echo', null, JSON.stringify('bob'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ifError(err);
        assert.equal(String(arg3), '"bob"');

        mary.destroy();
        assert.end();
    }
});
