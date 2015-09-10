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

allocCluster.test('emits stats on call success', {
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
    var statsd = nullStatsd(9);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.headers.as = 'raw';
            res.sendOk(h, b);
        }, 500);
        timers.advance(500);
    });

    client.statTags = client.options.statTags = {
        app: 'pool',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var clientChan = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            },
            timeout: 1000
        }
    });

    clientChan.request({
        serviceName: 'reservoir',
        hasNoParent: true,
        headers: {
            cn: 'inPipe'
        }
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        client.flushStats();

        assert.ok(res.ok, 'res should be ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.outbound.calls.sent.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.initiated.' + serverHost,
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.request.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-sent.127-0-0-1',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.response.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 67,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-recvd.127-0-0-1',
            value: null,
            delta: 67,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.per-attempt-latency.inPipe.reservoir.Reservoir--get.0',
            value: null,
            delta: null,
            time: 500
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.success.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});

allocCluster.test('emits stats on p2p call success', {
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
    var statsd = nullStatsd(9);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.headers.as = 'raw';
            res.sendOk(h, b);
        }, 500);
        timers.advance(500);
    });

    client.statTags = client.options.statTags = {
        app: 'pool',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var clientChan = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            },
            timeout: 1000
        }
    });

    clientChan.waitForIdentified({
        host: server.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        clientChan.request({
            host: server.hostPort,
            serviceName: 'reservoir',
            hasNoParent: true,
            headers: {
                cn: 'inPipe'
            }
        }).send('Reservoir::get', 'ton', '20', onResponse);
    });

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        client.flushStats();

        assert.ok(res.ok, 'res should be ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.connections.initiated.' + serverHost,
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.sent.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.request.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-sent.127-0-0-1',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.response.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 67,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-recvd.127-0-0-1',
            value: null,
            delta: 67,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.per-attempt-latency.inPipe.reservoir.Reservoir--get.0',
            value: null,
            delta: null,
            time: 500
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.success.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }], 'stats keys/values as expected');

        assert.end();
    }
});

allocCluster.test('emits stats with no connection metrics', {
    numPeers: 2,
    channelOptions: {
        timers: timers,
        emitConnectionMetrics: false
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var statsd = nullStatsd(9);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.headers.as = 'raw';
            res.sendOk(h, b);
        }, 500);
        timers.advance(500);
    });

    client.statTags = client.options.statTags = {
        app: 'pool',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var clientChan = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            },
            timeout: 1000
        }
    });

    clientChan.request({
        serviceName: 'reservoir',
        hasNoParent: true,
        headers: {
            cn: 'inPipe'
        }
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        client.flushStats();

        assert.ok(res.ok, 'res should be ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.outbound.calls.sent.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.request.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.response.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 67,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.per-attempt-latency.inPipe.reservoir.Reservoir--get.0',
            value: null,
            delta: null,
            time: 500
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.success.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});

allocCluster.test('emits stats on call failure', {
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
    var statsd = nullStatsd(10);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.headers.as = 'raw';
            res.sendNotOk(h, '0');
        }, 500);
        timers.advance(500);
    });

    client.statTags = client.options.statTags = {
        app: 'pool',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    client.channelStatsd = new TChannelStatsd(client, statsd);
    var clientChan = client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    clientChan.request({
        serviceName: 'reservoir',
        hasNoParent: true,
        headers: {
            cn: 'inPipe'
        },
        timeout: 1000
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        client.flushStats();

        assert.ok(res.ok === false, 'res should be not ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.outbound.calls.sent.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.initiated.' + serverHost,
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.request.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-sent.127-0-0-1',
            value: null,
            delta: 109,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.response.size.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 66,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.connections.bytes-recvd.127-0-0-1',
            value: null,
            delta: 66,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.per-attempt-latency.inPipe.reservoir.Reservoir--get.0',
            value: null,
            delta: null,
            time: 500
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.per-attempt.app-errors.inPipe.reservoir.Reservoir--get.unknown.0',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.outbound.calls.app-errors.inPipe.reservoir.Reservoir--get.unknown',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.outbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});
