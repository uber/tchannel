'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts.body-missing',
    fullType: 'autobahn.service-hosts.body-missing',
    message: 'Autobahn: service-hosts endpoint requires JSON request body',
    name: 'AutobahnServiceHostsBodyMissingError'
};

allocCluster.test('call find with no body', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getHosts(null, onResults);

    function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
