'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('find hosts for service', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getHosts({
        serviceName: 'Dummy'
    }, onResults);

    function onResults(err, resp) {
        if (err) {
            assert.ifErr(err);
            return assert.end();
        }

        var exitHosts = entryNode.hostsFor('Dummy');

        assert.deepEqual(resp.body, exitHosts,
            'egress nodes exist');

        var ringpopHosts = cluster.ringpopHosts;
        resp.body.forEach(function eachHost(hostPort) {
            assert.ok(ringpopHosts.indexOf(hostPort) >= 0,
                'egress node is in ring');
        });
        assert.end();
    }
});
