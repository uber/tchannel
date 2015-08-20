'use strict';

var makeCountedReadySignal = require('ready-signal/counted');
var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('find connections for service', {
    size: 10,
    dummySize: 5
}, function t(cluster, assert) {
    var apps = cluster.apps;
    var dummies = cluster.dummies;

    // setup
    var ready = makeCountedReadySignal(dummies.length);
    for (var i = 0; i < dummies.length; i++) {
        cluster.sendRegister(dummies[i], {
            serviceName: 'Dummy'
        }, onRegister);
    }

    ready(runTest);

    function onRegister(err, resp) {
        assert.ifError(err);

        ready.signal();
    }

    function runTest() {
        var entryNode = apps[0];

        cluster.checkExitPeers(assert, {
            serviceName: 'Dummy',
            hostPort: dummies[0].hostPort
        });

        entryNode.client.getConnections({
            serviceName: 'Dummy'
        }, onResults);

        function onResults(err, resp) {
            if (err) {
                assert.ifError(err);
                assert.end();
                return;
            }

            var exitHosts = entryNode.hostsFor('Dummy');

            var body = resp.body;
            assert.deepEqual(
                exitHosts.sort(),
                Object.keys(body).sort(),
                'got expected exit hosts back');

            Object.keys(body).forEach(function checkInstances(key) {
                if (body[key].err) {
                    assert.ifError(body[key].err);
                    return;
                }

                var exitInstances = body[key].instances;

                Object.keys(exitInstances).forEach(function checkInst(key2) {
                    var exitInstance = exitInstances[key2];

                    var isConnected = exitInstance.connected.out ||
                        exitInstance.connected.in;

                    assert.equal(isConnected, true,
                        'exit instance is connected');
                });
            });

            assert.end();
        }
    }
});
