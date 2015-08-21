'use strict';

var allocCluster = require('./lib/test-cluster.js');

allocCluster.test('tchannel health', {
    size: 1,
    dummySize: 0,
    namedRemotes: []
}, function t(cluster, assert) {
    var app = cluster.apps[0];

    app.client.sendHealth(function onResponse(err, resp) {
        assert.ifError(err);

        assert.equal(resp.body, 'hello from autobahn\n');

        assert.end();
    });
});
