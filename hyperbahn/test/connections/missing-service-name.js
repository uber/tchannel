'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts-connections.service-name-required',
    fullType: 'autobahn.service-hosts-connections.service-name-required',
    message: 'Autobahn: service-hosts-connections endpoint requires ' +
        'service name string',
    name: 'AutobahnServiceHostsConnectionsServiceNameRequiredError'
};

allocCluster.test('connections with missing service name', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getConnections({
        serviceName: null
    }, onResults);

    function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
