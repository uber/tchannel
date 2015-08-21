'use strict';

var parallel = require('run-parallel');

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('forwarding small timeout concurrently', {
    size: 5,
    dummySize: 2,
    namedRemotes: ['mary']
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    var mary = cluster.namedRemotes[0];

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    steve.serverChannel.register('m', function m(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, 'oh hi');
    });

    parallel([
        send(bob.clientChannel),
        send(mary.clientChannel)
    ], function onResults(err2, results) {
        assert.ifError(err2);

        assert.equal(results[0].ok, true);
        assert.equal(results[1].ok, true);

        assert.end();
    });
});

function send(chan) {
    return function thunk(cb) {
        chan.request({
            serviceName: 'steve',
            timeout: 300
        }).send('m', null, null, cb);
    };
}
