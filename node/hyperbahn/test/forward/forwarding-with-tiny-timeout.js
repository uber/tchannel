'use strict';

var setTimeout = require('timers').setTimeout;

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forwarding small timeout', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    cluster.checkExitPeers(assert, {
        serviceName: 'steve',
        hostPort: steve.hostPort
    });

    steve.serverChannel.register('method', function m(req, res) {
        // long delay
        setTimeout(function sendStuff() {
            res.headers.as = 'raw';
            res.sendOk(null, 'oh hi');
        }, 500);
    });

    bob.clientChannel.request({
        serviceName: steve.serviceName,
        timeout: 300
    }).send('method', null, null, onFirst);

    function onFirst(err) {
        assert.ok(err, 'first request should time out');

        bob.clientChannel.request({
            serviceName: steve.serviceName,
            timeout: 600
        }).send('method', null, null, onSecond);
    }

    function onSecond(err, res, arg2, arg3) {
        assert.ifError(err, 'second request should succeed');

        assert.ok(res && res.ok);

        assert.equal(String(arg3), 'oh hi');

        assert.end();
    }
});
