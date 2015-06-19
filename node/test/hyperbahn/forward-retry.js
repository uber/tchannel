'use strict';

var AutobahnClient = require('../');

var DebugLogtron = require('debug-logtron');

var allocCluster = require('autobahn/test/lib/test-cluster.js');
var TChannelJSON = require('tchannel/as/json');

allocCluster.test('register and forward', {
    size: 10
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    var steveAutobahnClient = new AutobahnClient({
        serviceName: steve.serviceName,
        hostPortList: cluster.hostPortList,
        tchannel: steve.channel,
        callerName: 'forward-retry-test',
        logger: DebugLogtron('autobahnClient')
    });

    var tchannelJSON = TChannelJSON({
        logger: steve.logger
    });

    steveAutobahnClient.once('registered', onSteveRegistered);
    steveAutobahnClient.register(onSteveRegistered);

    // TODO: intermittent flap about can't request on destroyed channel
    // TODO: flappy leaked handle hang

    function onSteveRegistered() {
        var egressNodes = cluster.apps[0].exitsFor(steve.serviceName);

        cluster.apps.forEach(function destroyBobEgressNodes(node) {
            if (egressNodes[node.hostPort]) {
                node.destroy({
                    force: true
                });
            }
        });

        var fwdreq = bob.clientChannel.request({
            timeout: 5000,
            serviceName: 'steve',
            hasNoParent: true,
            retryLimit: 20,
            headers: {
                cn: 'test'
            }
        });
        tchannelJSON.send(fwdreq, 'echo', null, 'oh hi lol', onForwarded);

        function onForwarded(err2, resp) {
            // TODO: cleaner once we have explicit network error type
            assert.ok(
                err2 && err2.type === 'tchannel.socket' ||
                /socket/.test(err2 && err2.message),
                'expceted to have failed socket');

            fwdreq.outReqs.forEach(function each(outreq) {
                if (egressNodes[outreq.remoteAddr]) {
                    assert.ok(
                        outreq.err.type === 'tchannel.socket' ||
                        outreq.err.type === 'tchannel.connection.reset',
                        'expected socket error from exit node');
                } else {
                    // TODO: would be great to have an explicit network error
                    // for that
                    assert.ok(
                        outreq.err.type === 'tchannel.network' ||
                        outreq.err.type === 'tchannel.connection.reset',
                        'expected socket error from forward node');
                }
            });

            finish();
        }
    }

    function finish() {
        steveAutobahnClient.destroy();
        assert.end();
    }
});
