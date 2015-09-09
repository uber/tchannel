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

var allocCluster = require('./lib/alloc-cluster');

function countConnections(channel) {
    var outCount = 0;
    var inCount = 0;
    var map = channel.peers._map;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
        var peer = map[keys[i]];
        outCount += peer.countConnections('out');
        inCount += peer.countConnections('in');
    }

    return {
        inCount: inCount,
        outCount: outCount
    };
}

allocCluster.test('prefer any re-uses incoming conn and does not open outgoing conn', {
    numPeers: 2
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    setupEcho(bob, 'bob');
    var subBob = bob.makeSubChannel({
        serviceName: 'steve',
        peers: [steve.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    var subSteve = steve.makeSubChannel({
        serviceName: 'bob',
        peers: [bob.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    subBob.request({
        serviceName: 'steve',
        hasNoParent: true
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res) {
        subSteve.request({
            serviceName: 'bob',
            hasNoParent: true
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res, arg2, arg3) {
        var steveCount = countConnections(steve);
        var bobCount = countConnections(bob);
        assert.equals(bobCount.inCount, 0, 'bob should not have incoming connections');
        assert.equals(bobCount.outCount, 1, 'bob should have 1 outgoing connection');
        assert.equals(steveCount.outCount, 0, 'steve should not have outgoing connections');
        assert.equals(steveCount.inCount, 1, 'steve should have 1 incoming connection');
        assert.end();
    }
});

allocCluster.test('prefer outgoing creates new conn even if incoming', {
    numPeers: 2,
    preferOutgoing: true
}, function t(cluster, assert) {
    var steve = cluster.channels[0];
    var bob = cluster.channels[1];

    setupEcho(steve, 'steve');
    setupEcho(bob, 'bob');
    var subBob = bob.makeSubChannel({
        serviceName: 'steve',
        peers: [steve.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    var subSteve = steve.makeSubChannel({
        serviceName: 'bob',
        peers: [bob.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    subBob.request({
        serviceName: 'steve',
        hasNoParent: true
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res) {
        subSteve.request({
            serviceName: 'bob',
            hasNoParent: true
        }).send('echo', 'a', 'b', onResponse2);
    }

    function onResponse2(err, res, arg2, arg3) {
        var steveCount = countConnections(steve);
        var bobCount = countConnections(bob);
        assert.ok(bobCount.inCount >= 1, 'bob should have incoming connections');
        assert.ok(bobCount.outCount >= 1, 'bob should have outgoing connections');
        assert.ok(steveCount.outCount >= 1, 'steve should have outgoing connections');
        assert.ok(steveCount.inCount >= 1, 'steve should have incoming connections');
        assert.end();
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
