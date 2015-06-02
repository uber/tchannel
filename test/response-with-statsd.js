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

allocCluster.test('emits stats on response ok', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var statsd = nullStatsd(3);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.sendOk(h, b);
        }, 500);
        timers.advance(500);
    });
    server.statTags = server.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    server.channelStatsd = new TChannelStatsd(server, statsd);

    client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort]
    });

    client.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }
        assert.ok(res.ok, 'res should be ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.inbound.calls.recvd.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.calls.success.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.inbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});

allocCluster.test('emits stats on response not ok', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var statsd = nullStatsd(3);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.sendNotOk('failure', 'busy');
        }, 500);
        timers.advance(500);
    });
    server.statTags = server.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    server.channelStatsd = new TChannelStatsd(server, statsd);

    client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort]
    });

    client.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }
        assert.equal(res.ok, false, 'res should be not ok');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.inbound.calls.recvd.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.calls.app-errors.inPipe.reservoir.Reservoir--get.unknown',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.inbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});

allocCluster.test('emits stats on response error', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var statsd = nullStatsd(3);

    server.makeSubChannel({
        serviceName: 'reservoir'
    }).register('Reservoir::get', function get(req, res, h, b) {
        timers.setTimeout(function onSend() {
            res.sendError('ProtocolError', 'bad request!');
        }, 500);
        timers.advance(500);
    });
    server.statTags = server.options.statTags = {
        app: 'waterSupply',
        host: os.hostname(),
        cluster: 'c0',
        version: '1.0'
    };
    server.channelStatsd = new TChannelStatsd(server, statsd);

    client.makeSubChannel({
        serviceName: 'reservoir',
        peers: [server.hostPort]
    });

    client.request({
        serviceName: 'reservoir',
        headers: {
            cn: 'inPipe'
        }
    }).send('Reservoir::get', 'ton', '20', onResponse);

    function onResponse(err, res, arg2, arg3) {
        assert.notEqual(err, null, 'err should not be null');
        assert.equal(res, null, 'res should be null');
        assert.deepEqual(statsd._buffer._elements, [{
            type: 'c',
            name: 'tchannel.inbound.calls.recvd.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'c',
            name: 'tchannel.inbound.calls.system-errors.inPipe.reservoir.Reservoir--get.ProtocolError',
            value: null,
            delta: 1,
            time: null
        }, {
            type: 'ms',
            name: 'tchannel.inbound.calls.latency.inPipe.reservoir.Reservoir--get',
            value: null,
            delta: null,
            time: 500
        }], 'stats keys/values as expected');

        assert.end();
    }
});
