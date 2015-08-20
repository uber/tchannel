'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts.service-name-invalid',
    fullType: 'autobahn.service-hosts.service-name-invalid',
    message: 'Autobahn: service-hosts endpoint requires valid service name ' +
        '[a-zA-Z0-9-_]+, got !',
    serviceName: '!',
    name: 'AutobahnServiceHostsServiceNameInvalidError'
};

allocCluster.test('call find with invalid service name', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getHosts({
        serviceName: '!'
    }, onResults);

    function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
