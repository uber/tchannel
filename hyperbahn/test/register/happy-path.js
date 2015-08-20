'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('can register', {
    size: 5,
    dummies: 1
}, function t(cluster, assert) {
    var dummy = cluster.dummies[0];

    cluster.sendRegister(dummy, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: dummy.hostPort
        });

        assert.equal(result.head, null, 'head from register is null');
        var registerResult = result.body;

        assert.ok(registerResult.connectionCount <= 5 &&
            registerResult.connectionCount >= 1,
            'expected to have at most 5 register connections');

        assert.end();
    }
});
