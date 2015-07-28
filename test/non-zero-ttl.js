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

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('request() with zero timeout', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'resetting connection');

    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server'
    });

    subTwo.waitForIdentified({
        host: one.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        var peer = subTwo.peers.add(one.hostPort);
        var conn = peer.connect();

        // fff magic test
        var req = conn.buildOutRequest({
            channel: conn.channel,
            peer: peer,
            remoteAddr: conn.remoteName,
            timeout: 0,
            tracer: conn.tracer,
            serviceName: 'server',
            host: one.hostPort,
            hasNoParent: true,
            checksumType: null,
            timers: conn.channel.timers,
            headers: {
                'as': 'raw',
                'cn': 'wat'
            }
        });
        conn.ops.addOutReq(req);

        req.send('echo', '', '', onResponse);
    });

    function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.type, 'tchannel.connection.reset');
        assert.equal(err.message,
            'tchannel: tchannel write failure: Got an invalid ttl. Expected positive ttl but got 0'
        );

        assert.equal(resp, null);

        process.nextTick(checkLog);
    }

    function checkLog() {
        assert.equal(cluster.logger.items().length, 1);
        var logLine = cluster.logger.items()[0];
        assert.equal(logLine && logLine.levelName, 'info');
        assert.equal(logLine && logLine.meta.error.type, 'tchannel.protocol.write-failed');

        assert.end();
    }
});

allocCluster.test('request() with zero timeout', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'resetting connection');

    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server'
    });

    subTwo.waitForIdentified({
        host: one.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        var peer = subTwo.peers.add(one.hostPort);
        var conn = peer.connect();

        var req = conn.buildOutRequest({
            channel: conn.channel,
            peer: peer,
            remoteAddr: conn.remoteName,
            timeout: -10,
            tracer: conn.tracer,
            serviceName: 'server',
            host: one.hostPort,
            hasNoParent: true,
            checksumType: null,
            timers: conn.channel.timers,
            headers: {
                'as': 'raw',
                'cn': 'wat'
            }
        });
        conn.ops.addOutReq(req);

        req.send('echo', '', '', onResponse);
    });

    function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.type, 'tchannel.connection.reset');
        assert.equal(err.message,
            'tchannel: tchannel write failure: Got an invalid ttl. Expected positive ttl but got -10'
        );

        assert.equal(resp, null);

        process.nextTick(checkLog);
    }

    function checkLog() {
        assert.equal(cluster.logger.items().length, 1);
        var logLine = cluster.logger.items()[0];
        assert.equal(logLine && logLine.levelName, 'info');
        assert.equal(logLine && logLine.meta.error.type, 'tchannel.protocol.write-failed');

        assert.end();
    }
});
