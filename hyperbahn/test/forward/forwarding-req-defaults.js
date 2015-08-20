'use strict';

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forwarding small timeout concurrently', {
    size: 5,
    serviceReqDefaults: {
        tcollector2: {
            retryLimit: 1
        }
    },
    namedRemotes: ['tcollector2', 'tcollector2', 'tcollector2']
}, function t(cluster, assert) {
    cluster.logger.whitelist('warn', 'forwarding error frame');

    var bob = cluster.remotes.bob;

    var fooCounter = 0;

    var tcollector0 = cluster.namedRemotes[0];
    var tcollector1 = cluster.namedRemotes[1];
    var tcollector2 = cluster.namedRemotes[2];

    tcollector0.serverChannel.register('foo', foo);
    tcollector1.serverChannel.register('foo', foo);
    tcollector2.serverChannel.register('foo', foo);

    bob.clientChannel.request({
        serviceName: 'tcollector2',
        retryLimit: 1
    }).send('foo', '', '', onResponse);

    function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.message, 'unexpected error');

        var lines = cluster.logger.items();
        assert.ok(lines.length >= 1);
        assert.equal(lines[0].meta.error.type, 'tchannel.unexpected');

        assert.end();
    }

    function foo(req, res) {
        fooCounter++;

        res.sendError('UnexpectedError', 'unexpected error');
    }
});
