'use strict';

var DebugLogtron = require('debug-logtron');

var AutobahnClient = require('../index.js');

var allocCluster = require('autobahn/test/lib/test-cluster.js');

allocCluster.test('register with timed out autobahn', {
    size: 2
}, function t(cluster, assert) {
    MockBahn(cluster.dummies[0]);

    var client = AutobahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        hostPortList: [cluster.dummies[0].hostPort],
        tchannel: cluster.dummies[1],
        hardFail: true,
        registrationTimeout: 100,
        logger: DebugLogtron('autobahnClient')
    });

    client.logger.whitelist('error',
        'AutobahnClient: registration failure, marking server as sick'
    );
    client.logger.whitelist('fatal',
        'AutobahnClient: registration timed out'
    );

    client.register({
        timeout: 200
    });
    client.once('error', onError);

    function onError(err) {
        assert.ok(err);

        assert.equal(err.type,
            'autobahn-client.registration-timeout');
        assert.equal(err.time, 100);
        assert.equal(err.fullType,
            'autobahn-client.registration-timeout' +
            '~!~error.wrapped-unknown');
        assert.equal(err.causeMessage,
            'registration timeout!');

        assert.end();
    }
});

allocCluster.test('register with timed out autobahn + no hardFail', {
    size: 2
}, function t(cluster, assert) {
    MockBahn(cluster.dummies[0]);

    var client = AutobahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        hostPortList: [cluster.dummies[0].hostPort],
        tchannel: cluster.dummies[1],
        logger: DebugLogtron('autobahnClient')
    });

    var attempts = 0;

    client.on('error', onError);
    client.on('register-attempt', onRegisterAttempt);
    client.register({
        timeout: 200
    });

    function onError() {
        assert.ok(false, 'should not error');
    }

    function onRegisterAttempt() {
        if (++attempts < 3) {
            return;
        }

        client.removeListener('register-attempt', onRegisterAttempt);

        client.destroy();
        assert.ok(true);

        assert.end();
    }
});

function MockBahn(channel) {
    var hyperChan = channel.makeSubChannel({
        serviceName: 'hyperbahn'
    });

    hyperChan.register('ad', ad);

    function ad(req, res, arg2, arg3) {
        /* do nothing to time out */
    }
}
