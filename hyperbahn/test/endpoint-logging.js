'use strict';

var NullLogtron = require('null-logtron');
var NullStatsd = require('uber-statsd-client/null');

var allocCluster = require('./lib/test-cluster.js');

allocCluster.test('server writes to access', {
    clients: {
        logger: NullLogtron(),
        statsd: NullStatsd()
    }
}, function t(cluster, assert) {
    var app = cluster.apps[0];
    var statsd = app.clients.statsd;

    app.client.sendHealth(function onResponse(err, resp) {
        app.clients.tchannel.flushStats();

        assert.ifError(err);
        if (!err) {
            assert.equal(resp.body, 'hello from autobahn\n');
            var stats = statsd._buffer._elements.slice();
            var accessStats = stats.filter(function is(x) {
                return x.type === 'c' &&
                    x.name === 'tchannel.inbound.calls.recvd.' +
                        'test-client.autobahn.health_v1';
            });
            assert.equal(accessStats.length, 1);
            var stat = accessStats[0] || {};
            assert.equal(stat.delta, 1);
            assert.equal(stat.name,
                'tchannel.inbound.calls.recvd.' +
                 'test-client.autobahn.health_v1');
        }
        assert.end();
    });
});
