'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register and forward', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    bob.clientChannel.request({
        serviceName: steve.serviceName
    }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);

    function onForwarded(err, res, arg2, arg3) {
        if (err) {
            assert.ifError(err);
            return assert.end();
        }

        assert.equal(String(arg3), '"oh hi lol"');

        assert.end();
    }
});
