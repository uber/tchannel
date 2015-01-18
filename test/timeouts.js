'use strict';

var test = require('tape');
var TimeMock = require('time-mock');

var allocCluster = require('./lib/alloc-cluster.js');

test('requests will timeout', function t(assert) {
    var timers = TimeMock(Date.now());
    var cluster = allocCluster({ timers: timers });

    cluster.one.register('/normal-proxy', normalProxy);
    cluster.one.register('/timeout', timeout);

    cluster.two.send({
        host: cluster.hosts.one,
        timeout: 1000
    }, '/normal-proxy', 'h', 'b', function onResp(err, h, b) {
        assert.ifError(err);

        assert.equal(String(h), 'h');
        assert.equal(String(b), 'b');

        cluster.two.send({
            host: cluster.hosts.one,
            timeout: 1000
        }, '/timeout', 'h', 'b', onTimeout);
        timers.advance(2500);
    });

    function onTimeout(err) {
        assert.ok(err);
        assert.equal(err.message, 'timed out');

        cluster.destroy();
        assert.end();
    }

    function normalProxy(head, body, hostInfo, cb) {
        cb(null, head, body);
    }
    function timeout(head, body, hostInfo, cb) {
        // do not call cb();
    }
});
