'use strict';

var parallel = require('run-parallel');

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

allocCluster.test('delete peer() on top channel', {
    numPeers: 3
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve1');
    setupEcho(steve, 'steve2');
    var bob1 = bob.makeSubChannel({
        serviceName: 'steve1'
    });
    var bob2 = bob.makeSubChannel({
        serviceName: 'steve2'
    });

    bob1.peers.add(steve.hostPort);
    bob2.peers.add(steve.hostPort);

    parallel([
        thunkSend(bob1, {
            service: 'steve1'
        }, 'echo', 'a', 'b'),
        thunkSend(bob2, {
            service: 'steve2'
        }, 'echo', 'a', 'b')
    ], onResponses);

    function onResponses(err, results) {
        assert.ifError(err, 'should not error');

        results.forEach(function checkRes(resp) {
            assert.ok(resp.ok, 'response should be ok');
        });

        bob.peers.delete(steve.hostPort);

        parallel([
            thunkSend(bob1, {
                service: 'steve1'
            }, 'echo', 'a', 'b'),
            thunkSend(bob2, {
                service: 'steve2'
            }, 'echo', 'a', 'b')
        ], onResponses2);
    }

    function onResponses2(err) {
        assert.ok(err, 'expect an error');

        console.log('error', err);

        assert.end();
    }

    function thunkSend(channel, reqOpts, arg1, arg2, arg3) {
        /*eslint max-params: [2, 5]*/
        return function thunk(cb) {
            channel.request(reqOpts)
                .send(arg1, arg2, arg3, cb);
        };
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
