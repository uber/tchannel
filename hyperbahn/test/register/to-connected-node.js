'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register to a running server', {
    size: 2
}, function t(cluster, assert) {
    var server = cluster.dummies[0];

    cluster.sendRegister(server, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        var body = result.body;
        assert.equal(typeof body.connectionCount, 'number');

        server.close();
        assert.end();
    }
});

allocCluster.test('double register to same hostPort', {
    size: 2
}, function t(cluster, assert) {
    var server = cluster.dummies[0];

    cluster.sendRegister(server, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        cluster.sendRegister(server, {
            serviceName: 'hello-bob'
        }, onResponse2);
    }

    function onResponse2(err, result) {
        assert.ifError(err);

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        var body = result.body;

        assert.equal(typeof body.connectionCount, 'number');

        server.close();
        assert.end();
    }
});
