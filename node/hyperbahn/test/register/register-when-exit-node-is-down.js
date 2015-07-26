'use strict';

/* Given a 5 node cluster where k = 3.

    Find a key that hashes from En1 to eX1
    Kill eX1 then send En1.register()

    Expect to get two results back and one failure

*/

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register when exit node is down', {
    size: 5,
    seedConfig: {
        'core': {
            'exitNode': {
                'k': 3
            }
        }
    }
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];
    var exitNode1 = cluster.apps[1];
    var steve = cluster.dummies[0];

    cluster.logger.whitelist(
        'warn',
        'Relay advertise failed with expected err'
    );

    var serviceName = entryNode.ring
        .hashToHostPort(exitNode1).service;

    exitNode1.destroy({
        force: true
    });

    cluster.sendRegister(steve, {
        serviceName: serviceName,
        host: entryNode.hostPort
    }, onRegistered);

    function onRegistered(err, result) {
        if (err) {
            assert.ifError(err);
            return assert.end();
        }

        cluster.checkExitPeers(assert, {
            serviceName: serviceName,
            hostPort: steve.hostPort,
            blackList: [exitNode1.hostPort]
        });

        assert.ok(result.body.connectionCount <= 3 &&
            result.body.connectionCount > 0);

        var errors = cluster.logger.items();
        assert.equal(errors.length, 1);
        assert.equal(errors[0].fields.msg,
            'Relay advertise failed with expected err');
        assert.equal(errors[0].fields.error.fullType,
            'tchannel.socket~!~' +
            'error.wrapped-io.connect.ECONNREFUSED');

        assert.end();
    }
});
