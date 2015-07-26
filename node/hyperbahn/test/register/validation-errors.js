'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register fails for empty serviceName', {
    size: 2
}, function t(cluster, assert) {
    cluster.tchannelJSON.send(cluster.dummies[0].makeSubChannel({
        serviceName: 'hyperbahn',
        peers: cluster.hostPortList
    }).request({
        serviceName: 'hyperbahn',
        hasNoParent: true,
        timeout: 5000,
        headers: {
            'cn': ';)'
        }
    }), 'ad', null, {
        services: [{
            cost: 0,
            serviceName: ''
        }]
    }, onResponse);

    function onResponse(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, true);
        assert.equal(resp.body.connectionCount, 0);

        assert.end();
    }
});
