'use strict';

var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');
var HyperbahnCluster = require('../lib/hyperbahn-cluster.js');

HyperbahnCluster.test('can register', {
    size: 5
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    var client = new HyperbahnClient({
        serviceName: 'hello-bob',
        callerName: 'hello-bob-test',
        hostPortList: cluster.hostPortList,
        tchannel: bob.channel,
        logger: DebugLogtron('autobahnClient')
    });

    client.once('registered', onResponse);
    client.register();

    function onResponse() {
        var result = client.latestRegistrationResult;

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: bob.channel.hostPort
        });

        assert.equal(result.head, null);

        // Because of duplicates in a size 5 cluster we know
        // that we have at most 5 kValues
        assert.ok(result.body.connectionCount <= 5,
            'expect to have at most 5 register results');

        client.destroy();
        assert.end();
    }
});
