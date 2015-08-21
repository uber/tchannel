'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts-connections.service-name-invalid',
    fullType: 'autobahn.service-hosts-connections.service-name-invalid',
    message: 'Autobahn: service-hosts-connections endpoint requires valid ' +
        'service name [a-zA-Z0-9-_]+, got !',
    serviceName: '!',
    name: 'AutobahnServiceHostsConnectionsServiceNameInvalidError'
};

allocCluster.test('connections with invalid service name', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getConnections({
        serviceName: '!'
    }, onResults);

    function onResults(err, resp) {
        assert.ifError(err);
        // if (err) {
        //     assert.deepEqual(err, expectedError);
        //     return assert.end();
        // }

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
