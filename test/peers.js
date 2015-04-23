'use strict';

var allocCluster = require('./lib/alloc-cluster');

// clear()

allocCluster.test('add a peer and request', {
    numPeers: 2
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    bob = bob.makeSubChannel({
        serviceName: 'steve'
    });

    bob.request({
        service: 'steve'
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err) {
        assert.ok(err, 'expect request error');
        assert.equal(err.type, 'tchannel.no-peer-available',
            'expected no peer available');

        bob.peers.add(steve.hostPort);
        bob.request({
            service: 'steve'
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res, arg2, arg3) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');
        assert.equal(String(arg2), 'a', 'arg2 should be correct');
        assert.equal(String(arg3), 'b', 'arg3 should be correct');

        assert.end();
    }
});

allocCluster.test('adding a peer twice', {
    numPeers: 2
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    bob = bob.makeSubChannel({
        serviceName: 'steve'
    });

    bob.peers.add(steve.hostPort);
    bob.peers.add(steve.hostPort);
    bob.request({
        service: 'steve'
    }).send('echo', 'a', 'b', onResponse2);

    function onResponse2(err, res) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');

        assert.equal(steve.peers.keys().length, 1,
            'steve should only have one peer');

        assert.end();
    }
});

allocCluster.test('removing a peer and request', {
    numPeers: 2
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    bob = bob.makeSubChannel({
        serviceName: 'steve'
    });

    bob.peers.add(steve.hostPort);
    bob.request({
        service: 'steve'
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');

        bob.peers.delete(steve.hostPort);
        bob.request({
            service: 'steve'
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res) {
        assert.ok(err, 'expect request error');
        assert.equal(err.type, 'tchannel.no-peer-available',
            'expected no peer available');

        assert.end();
    }
});

allocCluster.test('clearing peers and requests', {
    numPeers: 3
}, function t(cluster, assert) {
    var steve1 = cluster.channels[0];
    var steve2 = cluster.channels[1];
    var bob = cluster.channels[2];

    setupEcho(steve1, 'steve');
    setupEcho(steve2, 'steve');
    bob = bob.makeSubChannel({
        serviceName: 'steve'
    });

    bob.peers.add(steve1.hostPort);
    bob.peers.add(steve2.hostPort);
    bob.request({
        service: 'steve'
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');

        bob.peers.clear();
        bob.request({
            service: 'steve'
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res) {
        assert.ok(err, 'expect request error');
        assert.equal(err.type, 'tchannel.no-peer-available',
            'expected no peer available');

        assert.end();
    }
});

function setupEcho(channel, serviceName) {
    var c = channel.makeSubChannel({
        serviceName: serviceName
    });
    c.register('echo', function echo(req, res, arg2, arg3) {
        res.sendOk(arg2, arg3);
    });
}
