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

var TimeMock = require('time-mock');
var allocCluster = require('./lib/alloc-cluster.js');
var timers = TimeMock(Date.now());
var ErrorBackoff = require('../error_backoff.js');
var series = require('run-series');
var endhand = require('../endpoint-handler');

function send(channel, endpoint, check, done) {
    channel.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            'as': 'raw',
            cn: 'wat'
        }
    }).send(endpoint, null, null, function onResponse(err, res) {
        if (check) {
            check(err, res);
        }
        done(null, err, res);
    });
}

function sendStreaming(channel, endpoint, check, done) {
    var req = channel.request({
        serviceName: 'server',
        streamed: true,
        hasNoParent: true,
        headers: {
            'as': 'raw',
            cn: 'wat'
        }
    });
    req.on('response', good);
    req.on('error', bad);
    req.arg1.end(endpoint);
    req.arg2.end();
    req.arg3.end();

    function good(res) {
        onResponse(null, res);
    }

    function bad(err) {
        onResponse(err);
    }

    function onResponse(err, res) {
        if (check) {
            check(err, res);
        }
        process.nextTick(done.bind(null, err, res));
    }
}

allocCluster.test('error backoff work as expected', {
    numPeers: 1
}, function t(cluster, assert) {
    var channel = cluster.channels[0];
    var backoff = new ErrorBackoff({
        channel: channel,
        backoffRate: 1
    });

    backoff.handleError({
        type: 'tchannel.busy'
    }, 'bob', 'steve');
    assert.equal(backoff.reqErrors['bob~~steve'], 1, 'error counter works, should be 1');
    backoff.handleError({
        type: 'tchannel.busy'
    }, 'bob', 'steve');
    assert.equal(backoff.reqErrors['bob~~steve'], 2, 'error counter works, should be 2');
    backoff.handleError({
        type: 'tchannel.busy'
    }, 'bob', 'jane');
    assert.equal(backoff.reqErrors['bob~~jane'], 1, 'error counter works, should be 1');
    assert.equal(backoff.reqErrors['bob~~steve'], 2, 'error counter works, should be 2');

    var res = backoff.nextBackoffError('bob', 'jane');
    assert.ok(res, 'should backoff');
    assert.equal(res.type, 'tchannel.backoff.error', 'expected backoff error type');
    assert.equal(res.cn, 'bob', 'cn === bob');
    assert.equal(res.serviceName, 'jane', 'serviceName === jane');
    res = backoff.nextBackoffError('bob', 'jane');
    assert.ok(!res, 'should not backoff');
    res = backoff.nextBackoffError('bob', 'tom');
    assert.ok(!res, 'should not backoff');

    res = backoff.nextBackoffError('bob', 'steve');
    assert.ok(res, 'should backoff');
    assert.equal(res.type, 'tchannel.backoff.error', 'expected backoff error type');
    assert.equal(res.cn, 'bob', 'cn === bob');
    assert.equal(res.serviceName, 'steve', 'serviceName === steve');
    assert.equal(backoff.reqErrors['bob~~steve'], 1, 'error counter works, should be 1');

    assert.end();
});

allocCluster.test('error backoff on invalid cn/serviceName', {
    numPeers: 1
}, function t(cluster, assert) {
    var channel = cluster.channels[0];
    var backoff = new ErrorBackoff({
        channel: channel,
        backoffRate: 1
    });
    channel.logger.whitelist(
        'warn',
        'ErrorBackoff.handleError called with invalid parameters'
    );
    channel.logger.whitelist(
        'warn',
        'ErrorBackoff.nextBackoffError called with invalid parameters'
    );

    backoff.handleError({
        type: 'tchannel.timeout'
    }, null, 'steve');
    assert.equal(Object.keys(backoff.reqErrors).length, 0, 'nothing should be added when cn is invalid');

    backoff.handleError({
        type: 'tchannel.timeout'
    }, 'bob', null);
    assert.equal(Object.keys(backoff.reqErrors).length, 0, 'nothing should be added when serviceName is invalid');

    assert.ok(!backoff.nextBackoffError(null, 'steve'), 'should not backoff on invalid cn');
    assert.ok(!backoff.nextBackoffError('steve', null), 'should not backoff on invalid serviceName');

    assert.end();
});

allocCluster.test('should not backoff on good traffic', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var sub = one.makeSubChannel({
        serviceName: 'server'
    });

    sub.register('/normal-proxy', normalProxy);

    var twoSub = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    send(twoSub, '/normal-proxy', null, onResp);
    function onResp(empty, err, res) {
        if (err) {
            assert.end(err);
        }
        assert.equal(Object.keys(two.errorBackoff.reqErrors).length, 0, 'nothing should be added');
        assert.end();
    }

    function normalProxy(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    }
});

allocCluster.test('backoff on errors', {
    numPeers: 2,
    channelOptions: {
        timers: timers,
        backoffRate: 2
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var sub = one.makeSubChannel({
        serviceName: 'server'
    });

    one.logger.whitelist('warn', 'Unexpected error after end for OutRequest');

    sub.register('/normal-proxy', normalProxy);
    sub.register('/busy', busy);

    var twoSub = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    series([
        send.bind(null, twoSub, '/busy', check1),
        send.bind(null, twoSub, '/busy', check2),
        send.bind(null, twoSub, '/normal-proxy', check2),
        send.bind(null, twoSub, '/normal-proxy', check3),
    ], function done() {
        assert.end();
    });

    function normalProxy(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    }
    function busy(req, res, arg2, arg) {
        res.headers.as = 'raw';
        res.sendError('Busy', 'too busy!');
    }
    function check1(err, res) {
        assert.ok(err, 'there should be an error');
        assert.equal(err.type, 'tchannel.busy', 'error type as expected');
    }
    function check2(err, res) {
        assert.ok(err, 'there should be a backoff error');
        assert.equal(err.type, 'tchannel.backoff.error', 'backoff error type as expected');
    }
    function check3(err, res) {
        if (err) {
            assert.end(err);
        }
        assert.ok(res.ok, 'response should be ok');
    }
});

allocCluster.test('backoff on errors for streaming', {
    numPeers: 2,
    channelOptions: {
        timers: timers,
        backoffRate: 1
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var sub = one.makeSubChannel({
        serviceName: 'server'
    });
    var twoSub = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    one.logger.whitelist('warn', 'Unexpected error after end for OutRequest');
    cluster.connectChannels(cluster.channels, connected);

    function connected() {
        sub.handler = endhand();
        normalProxy.canStream = true;
        busy.canStream = true;
        sub.handler.register('/normal-proxy', {streamed: true}, normalProxy);
        sub.handler.register('/busy', {streamed: true}, busy);
        sendStreaming(twoSub, '/busy', check1, next1);
    }

    function next1() {
        sendStreaming(twoSub, '/busy', check2, next2);
    }

    function next2() {
        sendStreaming(twoSub, '/normal-proxy', check3, done);
    }

    function done() {
        assert.end();
    }

    function normalProxy(req, buildRes) {
        var res = buildRes({streamed: true});
        res.headers.as = 'raw';
        res.setOk(true);
        res.arg2.end();
        res.arg3.end();
    }
    function busy(req, buildRes) {
        var res = buildRes({streamed: true});
        res.headers.as = 'raw';
        res.sendError('Busy', 'too busy!');
    }
    function check1(err, res) {
        assert.ok(err, 'there should be an error');
        assert.equal(err.type, 'tchannel.busy', 'error type as expected');
    }
    function check2(err, res) {
        assert.ok(err, 'there should be a backoff error');
        assert.equal(err.type, 'tchannel.backoff.error', 'backoff error type as expected');
    }
    function check3(err, res) {
        if (err) {
            assert.end(err);
        }
        assert.ok(res.ok, 'response should be ok');
    }
});