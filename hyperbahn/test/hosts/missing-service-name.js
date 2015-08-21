'use strict';

var allocCluster = require('../lib/test-cluster.js');

var expectedError = {
    type: 'autobahn.service-hosts.service-name-required',
    fullType: 'autobahn.service-hosts.service-name-required',
    message: 'Autobahn: service-hosts endpoint requires service name string',
    name: 'AutobahnServiceHostsServiceNameRequiredError'
};

allocCluster.test('call find with missing service name', {
    size: 10
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];

    entryNode.client.getHosts({
        serviceName: null
    }, onResults);

    function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, false);
        assert.deepEqual(resp.body, expectedError);
        assert.end();
    }
});
