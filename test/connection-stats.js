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

var os = require('os');
var TimeMock = require('time-mock');

var allocCluster = require('./lib/alloc-cluster.js');
var timers = TimeMock(Date.now());

allocCluster.test('emits connection stats with success', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost = cluster.hosts[1];
    var stats = [];

    server.makeSubChannel({
        serviceName: 'server'
    });
    client.statTags = client.options.statTags = {
        app: 'server',
        host: os.hostname()
    };
    client.on('stat', function onStat(stat) {
        stats.push(stat);
    });

    var subClient = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort]
    });

    subClient.request({
        serviceName: 'server',
        headers: {
            cn: 'client'
        }
    });

    client.waitForIdentified({
        host: serverHost
    }, onIdentified);

    function onIdentified(err) {
        if (err) {
            return assert.end(err);
        }

        client.close();
        server.close();
        assert.deepEqual(stats, [{
            name: 'tchannel.connections.initiated',
            type: 'counter',
            value: 1,
            tags:
            {
                'host-port': clientHost,
                'peer-host-port': serverHost,
                app: 'server',
                host: os.hostname()
           }
        }, {
            name: 'tchannel.connections.closed',
            type: 'counter',
            value: 1,
            tags:
            {
                'host-port': clientHost,
                'peer-host-port': serverHost,
                reason: 'tchannel.socket-local-closed',
                app: 'server',
                host: os.hostname()
            }
        }]);

        assert.end();
    }
});

allocCluster.test('emits connection stats with failure', {
    numPeers: 1
}, function t(cluster, assert) {
    var client = cluster.channels[0];
    var clientHost = cluster.hosts[0];
    var stats = [];

    client.statTags = client.options.statTags = {
        app: 'server',
        host: os.hostname()
    };
    client.on('stat', function onStat(stat) {
        stats.push(stat);
    });

    var subClient = client.makeSubChannel({
        serviceName: 'server',
        // there should be nothing running on this port
        // the connection is supposed to fail
        peers: ['localhost:9999']
    });

    subClient.request({
        serviceName: 'server',
        headers: {
            cn: 'client'
        }
    });

    client.waitForIdentified({
        host: 'localhost:9999'
    }, onIdentified);

    function onIdentified(err) {
        assert.notEqual(err, null, 'should be an error');
        process.nextTick(function next() {
            client.flushStats();
            assert.deepEqual(stats, [{
                name: 'tchannel.connections.initiated',
                type: 'counter',
                value: 1,
                tags:
                {
                    'host-port': clientHost,
                    'peer-host-port': 'localhost:9999',
                    app: 'server',
                    host: os.hostname()
               }
            }, {
                name: 'tchannel.connections.connect-errors',
                type: 'counter',
                value: 1,
                tags:
                {
                    'host-port': clientHost,
                    'peer-host-port': 'localhost:9999',
                    app: 'server',
                    host: os.hostname()
               }
            }]);

            assert.end();
        });
    }
});

allocCluster.test('emits active connections', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost = cluster.hosts[1];
    var stats = [];

    server.makeSubChannel({
        serviceName: 'server'
    });
    client.statTags = client.options.statTags = {
        app: 'server',
        host: os.hostname()
    };
    client.on('stat', function onStat(stat) {
        stats.push(stat);
    });

    var subClient = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort]
    });

    subClient.request({
        serviceName: 'server',
        headers: {
            cn: 'client'
        }
    });

    client.waitForIdentified({
        host: serverHost
    }, onIdentified);

    function onIdentified(err) {
        if (err) {
            return assert.end(err);
        }

        timers.advance(1001);
        client.close();
        server.close();
        process.nextTick(function next() {
            assert.deepEqual(stats, [{
                name: 'tchannel.connections.initiated',
                type: 'counter',
                value: 1,
                tags:
                {
                    'host-port': clientHost,
                    'peer-host-port': serverHost,
                    app: 'server',
                    host: os.hostname()
               }
            }, {
                name: 'tchannel.connections.active',
                type: 'gauge',
                value: 1,
                tags:
                {
                    'host-port': clientHost,
                    'peer-host-port': serverHost,
                    app: 'server',
                    host: os.hostname()
               }
            }, {
                name: 'tchannel.connections.closed',
                type: 'counter',
                value: 1,
                tags:
                {
                    'host-port': clientHost,
                    'peer-host-port': serverHost,
                    reason: 'tchannel.socket-local-closed',
                    app: 'server',
                    host: os.hostname()
                }
            }]);

            assert.end();
        });
    }
});
