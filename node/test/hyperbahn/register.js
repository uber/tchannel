'use strict';

var TChannel = require('tchannel');
var DebugLogtron = require('debug-logtron');

var AutobahnClient = require('../');

var allocCluster = require('autobahn/test/lib/test-cluster.js');

allocCluster.test('can register', {
    size: 5
}, function t(cluster, assert) {
    var tchannel = new TChannel();

    tchannel.listen(0, '127.0.0.1', function listening() {
        var client = new AutobahnClient({
            serviceName: 'hello-bob',
            callerName: 'hello-bob-test',
            hostPortList: cluster.hostPortList,
            tchannel: tchannel,
            logger: DebugLogtron('autobahnClient')
        });

        client.once('registered', onResponse);
        client.register();

        function onResponse() {
            var result = client.latestRegistrationResult;

            cluster.checkExitPeers(assert, {
                serviceName: 'hello-bob',
                hostPort: tchannel.hostPort
            });

            assert.equal(result.head, null);

            // Because of duplicates in a size 5 cluster we know
            // that we have at most 5 kValues
            assert.ok(result.body.connectionCount <= 5,
                'expect to have at most 5 register results');

            tchannel.close();
            client.destroy();
            assert.end();
        }
    });
});
