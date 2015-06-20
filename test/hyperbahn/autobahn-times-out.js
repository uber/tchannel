'use strict';

var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');
var HyperbahnCluster = require('../lib/hyperbahn-cluster.js');

HyperbahnCluster.test('register with timed out hyperbahn', {
    size: 2
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;
    var steve = cluster.remotes.steve;

    MockBahn(steve.channel);

    var client = HyperbahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        hostPortList: [steve.channel.hostPort],
        tchannel: bob.channel,
        hardFail: true,
        registrationTimeout: 100,
        logger: DebugLogtron('hyperbahnClient')
    });

    client.logger.whitelist('error',
        'HyperbahnClient: registration failure, marking server as sick'
    );
    client.logger.whitelist('fatal',
        'HyperbahnClient: registration timed out'
    );

    client.register({
        timeout: 200
    });
    client.once('error', onError);

    function onError(err) {
        assert.ok(err);

        assert.equal(err.type,
            'hyperbahn-client.registration-timeout');
        assert.equal(err.time, 100);
        assert.equal(err.fullType,
            'hyperbahn-client.registration-timeout' +
            '~!~error.wrapped-unknown');
        assert.equal(err.causeMessage,
            'registration timeout!');

        assert.end();
    }
});

HyperbahnCluster.test('register with timed out hyperbahn + no hardFail', {
    size: 2
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;
    var steve = cluster.remotes.steve;

    MockBahn(steve.channel);

    var client = HyperbahnClient({
        serviceName: 'A',
        callerName: 'A-client',
        hostPortList: [steve.channel.hostPort],
        tchannel: bob.channel,
        logger: DebugLogtron('hyperbahnClient')
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
