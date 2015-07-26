'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts-connections.body-missing',
    fullType: 'autobahn.service-hosts-connections.body-missing',
    message: 'Autobahn: service-hosts-connections endpoint requires ' +
        'JSON request body',
    name: 'AutobahnServiceHostsConnectionsBodyMissingError'
};

allocCluster.test('connections with no body', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getConnections(null, onResults);

    function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
