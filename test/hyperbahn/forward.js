'use strict';

var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');
var HyperbahnCluster = require('../lib/hyperbahn-cluster.js');
var TChannelJSON = require('../../as/json');

HyperbahnCluster.test('register and forward', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    var tchannelJSON = TChannelJSON({
        logger: cluster.logger
    });

    var steveAutobahnClient = new HyperbahnClient({
        serviceName: steve.serviceName,
        callerName: 'forward-test',
        hostPortList: cluster.hostPortList,
        tchannel: steve.channel,
        logger: DebugLogtron('autobahnClient')
    });
    steveAutobahnClient.once('registered', onRegistered);
    steveAutobahnClient.register();

    function onRegistered() {
        var result = steveAutobahnClient.latestRegistrationResult;

        assert.equal(result.head, null, 'header is null');
        assert.ok(result.body, 'got a body');

        assert.equal(typeof result.body.connectionCount, 'number');

        tchannelJSON.send(bob.clientChannel.request({
            timeout: 5000,
            serviceName: steve.serviceName
        }), 'echo', null, 'oh hi lol', onForwarded);

    }

    function onForwarded(err, resp) {
        assert.ifError(err);
        assert.equal(String(resp.body), 'oh hi lol');

        steveAutobahnClient.destroy();
        assert.end();
    }
});
