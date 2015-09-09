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
var nullStatsd = require('uber-statsd-client/null');
var TChannelStatsd = require('../lib/statsd');
var timers = TimeMock(Date.now());

allocCluster.test('emits connection stats with success', {
    numPeers: 2,
    channelOptions: {
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0]
        .split(':')[0]
        .replace(/\./g, '-');
    var statsd = nullStatsd(2);

    server.makeSubChannel({
        serviceName: 'reservoir'
    });
    client.statTags = client.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var subClient = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort]
    });
    subClient.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    });

    client.waitForIdentified({
        host: cluster.hosts[0]
    }, onIdentified);

    function onIdentified(err) {
        if (err) {
            return assert.end(err);
        }

        client.close();
        server.close();
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.connections.initiated.' + serverHost,
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.closed.' + serverHost + '.tchannel-socket-local-closed',
            value: null,
            delta: 1,
            time: null
        }]);

        assert.end();
    }
});

allocCluster.test('emits connection stats with failure', {
    numPeers: 1,
    channelOptions: {
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var client = cluster.channels[0];
    var hostKey = 'localhost';
    var statsd = nullStatsd(2);

    client.statTags = client.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var subClient = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: ['localhost:9999']
    });
    subClient.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    });

    client.waitForIdentified({
        host: 'localhost:9999'
    }, onIdentified);

    function onIdentified(err) {
        assert.notEqual(err, null, 'should be an error');
        process.nextTick(function next() {
            client.flushStats();
            assert.deepEqual(statsd._buffer._elements, [{
                type: 'c',
                name: 'tchannel.connections.initiated.' + hostKey,
                value: null,
                delta: 1,
                time: null
            }, {
                type: 'c',
                name: 'tchannel.connections.connect-errors.' + hostKey,
                value: null,
                delta: 1,
                time: null
            }]);

            assert.end();
        });
    }
});

allocCluster.test('emits active connections', {
    numPeers: 2,
    channelOptions: {
        timers: timers,
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0]
        .split(':')[0]
        .replace(/\./g, '-');
    var statsd = nullStatsd(3);

    server.makeSubChannel({
        serviceName: 'reservoir'
    });
    client.statTags = client.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var subClient = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort]
    });
    subClient.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    });

    client.waitForIdentified({
        host: cluster.hosts[0]
    }, onIdentified);

    function onIdentified(err) {
        if (err) {
            return assert.end(err);
        }

        timers.advance(1001);
        client.close();
        server.close();
        process.nextTick(function next() {
            assert.deepEqual(statsd._buffer._elements, [{
                type: 'c',
                name: 'tchannel.connections.initiated.' + serverHost,
                value: null,
                delta: 1,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.connections.active.' + serverHost,
                value: 1,
                delta: null,
                time: null
            }, {
                type: 'c',
                name: 'tchannel.connections.closed.' + serverHost + '.tchannel-socket-local-closed',
                value: null,
                delta: 1,
                time: null
            }]);

            assert.end();
        });
    }
});
