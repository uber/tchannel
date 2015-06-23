// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var parallel = require('run-parallel');

var allocCluster = require('./lib/alloc-cluster');

allocCluster.test('add a peer and request', {
    numPeers: 2
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    bob = bob.makeSubChannel({
        serviceName: 'steve',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    bob.request({
        serviceName: 'steve',
        hasNoParent: true
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err) {
        assert.ok(err, 'expect request error');
        assert.equal(err.type, 'tchannel.no-peer-available',
            'expected no peer available');

        bob.peers.add(steve.hostPort);
        bob.request({
            serviceName: 'steve',
            hasNoParent: true
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
        serviceName: 'steve',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    bob.peers.add(steve.hostPort);
    bob.peers.add(steve.hostPort);
    bob.request({
        serviceName: 'steve',
        hasNoParent: true
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
        serviceName: 'steve',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    bob.peers.add(steve.hostPort);
    bob.request({
        serviceName: 'steve',
        hasNoParent: true
    }).send('echo', 'a', 'b', onResponse);

    var peer;
    function onResponse(err, res) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');

        peer = bob.peers.delete(steve.hostPort);
        bob.request({
            serviceName: 'steve',
            hasNoParent: true
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res) {
        assert.ok(err, 'expect request error');
        assert.equal(err.type, 'tchannel.no-peer-available',
            'expected no peer available');

        peer.close(assert.end);
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
        serviceName: 'steve',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    bob.peers.add(steve1.hostPort);
    bob.peers.add(steve2.hostPort);
    bob.request({
        serviceName: 'steve',
        hasNoParent: true
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res) {
        assert.ifError(err, 'request with peer should not fail');
        assert.equal(res.ok, true, 'response should be ok');

        bob.peers.clear();
        bob.request({
            serviceName: 'steve',
            hasNoParent: true
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res) {
        assert.ok(err, 'expect request error');
        assert.equal(err && err.type, 'tchannel.no-peer-available',
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
        serviceName: 'steve1',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });
    var bob2 = bob.makeSubChannel({
        serviceName: 'steve2',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    bob1.peers.add(steve.hostPort);
    bob2.peers.add(steve.hostPort);

    parallel([
        thunkSend(bob1, {
            serviceName: 'steve1',
            hasNoParent: true
        }, 'echo', 'a', 'b'),
        thunkSend(bob2, {
            serviceName: 'steve2',
            hasNoParent: true
        }, 'echo', 'a', 'b')
    ], onResponses);

    var peer;
    function onResponses(err, results) {
        assert.ifError(err, 'should not error');

        results.forEach(function checkRes(resp) {
            assert.ok(resp.ok, 'response should be ok');
        });

        peer = bob.peers.delete(steve.hostPort);

        parallel([
            thunkSend(bob1, {
                serviceName: 'steve1',
                hasNoParent: true
            }, 'echo', 'a', 'b'),
            thunkSend(bob2, {
                serviceName: 'steve2',
                hasNoParent: true
            }, 'echo', 'a', 'b')
        ], onResponses2);
    }

    function onResponses2(err) {
        assert.ok(err, 'expect an error');
        assert.equal(err && err.type, 'tchannel.no-peer-available',
            'expected no peers available');

        assert.equal(bob1.peers.keys().length, 0,
            'bob1 has no peers');
        assert.equal(bob2.peers.keys().length, 0,
            'bob2 has no peers');

        peer.close(assert.end);
    }

    function thunkSend(channel, reqOpts, arg1, arg2, arg3) {
        /*eslint max-params: [2, 5]*/
        return function thunk(cb) {
            channel.request(reqOpts)
                .send(arg1, arg2, arg3, cb);
        };
    }
});

allocCluster.test('peers.clear() on top channel', {
    numPeers: 3
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve1');
    setupEcho(steve, 'steve2');
    var bob1 = bob.makeSubChannel({
        serviceName: 'steve1',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });
    var bob2 = bob.makeSubChannel({
        serviceName: 'steve2',
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    var peer = bob1.peers.add(steve.hostPort);
    bob2.peers.add(steve.hostPort);

    parallel([
        thunkSend(bob1, {
            serviceName: 'steve1',
            hasNoParent: true
        }, 'echo', 'a', 'b'),
        thunkSend(bob2, {
            serviceName: 'steve2',
            hasNoParent: true
        }, 'echo', 'a', 'b')
    ], onResponses);

    function onResponses(err, results) {
        assert.ifError(err, 'should not error');

        results.forEach(function checkRes(resp) {
            assert.ok(resp.ok, 'response should be ok');
        });

        bob.peers.clear();

        parallel([
            thunkSend(bob1, {
                serviceName: 'steve1',
                hasNoParent: true
            }, 'echo', 'a', 'b'),
            thunkSend(bob2, {
                serviceName: 'steve2',
                hasNoParent: true
            }, 'echo', 'a', 'b')
        ], onResponses2);
    }

    function onResponses2(err) {
        assert.ok(err, 'expect an error');
        assert.equal(err && err.type, 'tchannel.no-peer-available',
            'expected no peers available');

        assert.equal(bob1.peers.keys().length, 0,
            'bob1 has no peers');
        assert.equal(bob2.peers.keys().length, 0,
            'bob2 has no peers');

        peer.close(assert.end);
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
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    });
}
