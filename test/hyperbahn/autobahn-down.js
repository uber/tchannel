'use strict';

var DebugLogtron = require('debug-logtron');

var AutobahnClient = require('../index.js');

var allocCluster = require('autobahn/test/lib/test-cluster.js');

allocCluster.test('register with autobahn down', {
    size: 2
}, function t(cluster, assert) {
    var client = AutobahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        // 5001 & 5002 should be DEAD ports
        hostPortList: ['127.0.0.1:5001', '127.0.0.1:5002'],
        tchannel: cluster.dummies[0],
        hardFail: true,
        registrationTimeout: 200,
        logger: DebugLogtron('autobahnClient')
    });

    client.logger.whitelist('error',
        'AutobahnClient: registration failure, marking server as sick'
    );
    client.logger.whitelist('fatal',
        'AutobahnClient: registration timed out'
    );

    client.register();
    client.once('error', onError);

    function onError(err) {
        assert.ok(err);

        assert.equal(err.type,
            'autobahn-client.registration-timeout');
        assert.equal(err.time, 200);
        assert.equal(err.code, 'ECONNREFUSED');
        assert.equal(err.syscall, 'connect');
        assert.equal(err.fullType,
            'autobahn-client.registration-timeout' +
            '~!~tchannel.socket' +
            '~!~error.wrapped-io.connect.ECONNREFUSED');
        assert.equal(err.causeMessage,
            'tchannel socket error ' +
            '(ECONNREFUSED from connect): ' +
            'connect ECONNREFUSED');

        assert.end();
    }
});

allocCluster.test('register with autobahn down + no hardFail', {
    size: 5
}, function t(cluster, assert) {
    var client = AutobahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        // 5001 & 5002 should be DEAD ports
        hostPortList: ['127.0.0.1:5001', '127.0.0.1:5002'],
        tchannel: cluster.dummies[0],
        logger: DebugLogtron('autobahnClient')
    });

    var attempts = 0;

    client.on('error', onError);
    client.on('register-attempt', onRegisterAttempt);
    client.register();

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
