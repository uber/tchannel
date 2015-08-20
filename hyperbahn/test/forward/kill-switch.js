'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('set kill switch and forward', {
    size: 1
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;
    var app = cluster.apps[0];

    app.client.sendKillSwitch({
        type: 'block',
        cn: '*',
        serviceName: 'steve'
    }, onSetKillSwitch);

    function onSetKillSwitch(err, res) {
        if (err) {
            return assert.end(err);
        }

        assert.ok(res.body.blockingTable['*~~steve'], 'should set the blocking service');
        cluster.sendRegister(steve.channel, {
            serviceName: steve.serviceName
        }, onRegistered);
    }

    function onRegistered(err, resp) {
        if (err) {
            return assert.end(err);
        }

        var body = resp.body;
        assert.ok(body, 'got a body from register');

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err, 'should fail');
        assert.equals(err.type, 'tchannel.request.timeout', 'error type should be timeout');
        assert.end();
    }
});
