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

var CountedReadySignal = require('ready-signal/counted');
var series = require('run-series');
var allocCluster = require('./lib/alloc-cluster');
var TChannel = require('../channel');
var randSeq = require('./lib/peer_score_random.js').randSeq;

allocCluster.test('request retries', {
    numPeers: 4
}, function t(cluster, assert) {
    // chan 1 declines
    cluster.channels[0]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', declineFoo);

    // chan 2 too busy
    cluster.channels[1]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', busyFoo);

    // chan 3 unexpected error
    cluster.channels[2]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', unexpectedErrorFoo);

    // success!
    cluster.channels[3]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', servedByFoo(4));

    var client = TChannel({
        timeoutFuzz: 0,
        random: randSeq([
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
                 1.0, 0.1, 0.1, // .request, chan 2 wins (1 is skipped)
                      1.0, 0.1, // .request, chan 3 wins (1-2 are skipped)
                           0.1  // .request, chan 4 wins (only one left)
        ], false /* NOTE: set true to print debug traces */)
    });
    var chan = client.makeSubChannel({
        serviceName: 'tristan',
        peers: cluster.hosts,
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            },
            serviceName: 'tristan'
        }
    });
    withConnectedClient(chan, cluster, onConnected);

    function onConnected() {
        var req = chan.request({
            hasNoParent: true,
            timeout: 100
        });
        req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
            onResponse(req, err, res, arg2, arg3);
        });
    }

    function onResponse(req, err, res, arg2, arg3) {
        if (err) return finish(err);

        assert.equal(req.outReqs.length, 4, 'expected 4 tries');

        assert.equal(
            req.outReqs[0].err &&
            req.outReqs[0].err.type,
            'tchannel.declined',
            'expected first request to decline');

        assert.equal(
            req.outReqs[1].err &&
            req.outReqs[1].err.type,
            'tchannel.busy',
            'expected second request to bounce b/c busy');

        assert.equal(
            req.outReqs[2].err &&
            req.outReqs[2].err.type,
            'tchannel.unexpected',
            'expected second request to bounce w/ unexpected error');

        assert.ok(req.outReqs[3].res, 'expected to have 4th response');
        assert.deepEqual(req.outReqs[3].res.arg2, arg2, 'arg2 came form 4th response');
        assert.deepEqual(req.outReqs[3].res.arg3, arg3, 'arg3 came form 4th response');
        assert.equal(String(arg2), 'served by 4', 'served by expected server');
        assert.equal(String(arg3), 'HI', 'got expected response');

        finish();
    }

    function finish(err) {
        assert.ifError(err, 'no final error');

        cluster.assertCleanState(assert, {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }]
        });

        client.close();
        assert.end();
    }
});

allocCluster.test('request application retries', {
    numPeers: 2
}, function t(cluster, assert) {
    // chan 1 returns retryable application error
    cluster.channels[0]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', fooLolError);

    // chan 2 returns non-retryable application error
    cluster.channels[1]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', fooStopError);

    var client = TChannel({
        timeoutFuzz: 0,
        random: randSeq([
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
                 1.0, 0.1, 0.1  // .request, chan 2 wins (1 is skipped)
        ], false /* NOTE: set true to print debug traces */)
    });
    var chan = client.makeSubChannel({
        serviceName: 'tristan',
        peers: cluster.hosts,
        requestDefaults: {
            serviceName: 'tristan',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });
    withConnectedClient(chan, cluster, onConnected);

    function onConnected() {
        var req = chan.request({
            timeout: 100,
            hasNoParent: true,
            shouldApplicationRetry: shouldApplicationRetry
        });
        req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
            onResponse(req, err, res, arg2, arg3);
        });
    }

    function onResponse(req, err, res, arg2, arg3) {
        if (err) return finish(err);

        assert.equal(req.outReqs.length, 2, 'expected 2 tries');

        assert.ok(
            req.outReqs[0].res &&
            !req.outReqs[0].res.ok,
            'expected first res not ok');
        assert.equal(
            req.outReqs[0].res &&
            String(req.outReqs[0].res.arg3),
            'lol',
            'expected first res arg3');

        assert.ok(req.outReqs[1].res, 'expected to have 2nd response');
        assert.ok(!res.ok, 'expected to have not been ok');
        assert.equal(String(arg3), 'stop', 'got expected response');

        finish();
    }

    function shouldApplicationRetry(req, res, retry, done) {
        if (res.streamed) {
            res.arg2.onValueReady(function arg2ready(err, arg2) {
                if (err) {
                    done(err);
                } else {
                    decideArg2(arg2);
                }
            });
        } else {
            decideArg2(res.arg2);
        }
        function decideArg2(arg2) {
            if (String(arg2) === 'meh') {
                retry();
            } else {
                done();
            }
        }
    }

    function finish(err) {
        assert.ifError(err, 'no final error');

        cluster.assertCleanState(assert, {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: []
            }, {
                peers: []
            }]
        });

        client.close();
        assert.end();
    }
});

allocCluster.test('retryFlags work', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.channels[0]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', handlerSeries([
            fooTimeout, // chan 1 timeout
            fooTimeout, // chan 1 timeout
            busyFoo,    // chan 1 busy
        ]));

    cluster.channels[1]
        .makeSubChannel({serviceName: 'tristan'})
        .register('foo', servedByFoo(2));

    var client = TChannel({
        timeoutFuzz: 0,
        random: randSeq([
            1.0, 0.1, // .request, chan 1 wins
            1.0, 0.1, // .request, chan 1 wins
                 1.0, // .request, chan 2 wins (1 is skipped)
            1.0, 0.1  // .request, chan 1 wins
        ], false /* NOTE: set true to print debug traces */)
    });
    var chan = client.makeSubChannel({
        serviceName: 'tristan',
        peers: cluster.hosts,
        requestDefaults: {
            serviceName: 'tristan',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    series([

        function defaultToNotRetryingTimeout(next) {
            var req = chan.request({
                hasNoParent: true,
                timeout: 100
            });
            req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
                assert.equal(req.outReqs.length, 1, 'expected 1 tries');
                assert.equal(err && err.type, 'tchannel.timeout', 'expected timeout error');
                next();
            });
        },

        function canRetryTimeout(next) {
            var req = chan.request({
                hasNoParent: true,
                retryFlags: {
                    never: false,
                    onConnectionError: true,
                    onTimeout: true
                }
            });
            req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
                if (err) return finish(err);

                assert.equal(req.outReqs.length, 2, 'expected 2 tries');

                assert.equal(
                    req.outReqs[0].err &&
                    req.outReqs[0].err.type,
                    'tchannel.timeout',
                    'expected first timeout error');

                assert.ok(res.ok, 'expected to have not ok');
                assert.ok(req.outReqs[1].res, 'expected to have 2nd response');
                assert.equal(String(arg3), 'HI', 'got expected response');

                next();
            });
        },

        function canOptOutFully(next) {
            var req = chan.request({
                hasNoParent: true,
                timeout: 100,
                retryFlags: {
                    never: true,
                    onConnectionError: false,
                    onTimeout: false
                }
            });
            req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
                assert.equal(req.outReqs.length, 1, 'expected 1 tries');
                assert.equal(err && err.type, 'tchannel.busy', 'expected busy error');
                next();
            });
        }

    ], finish);

    function finish(err) {
        assert.ifError(err, 'no final error');

        cluster.assertCleanState(assert, {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }]
        });

        client.close();
        assert.end();
    }
});

function handlerSeries(handlers) {
    var i = 0;
    return seriesHandler;
    function seriesHandler(req, res, arg2, arg3) {
        var handler = handlers[i];
        i = (i + 1) % handlers.length;
        handler(req, res, arg2, arg3);
    }
}

function fooTimeout(req, res, arg2, arg3) {
    res.sendError('Timeout', 'no luck');
}

function declineFoo(req, res, arg2, arg3) {
    res.sendError('Declined', 'magic 8-ball says no');
}

function busyFoo(req, res, arg2, arg3) {
    res.sendError('Busy', "can't talk");
}

function unexpectedErrorFoo(req, res, arg2, arg3) {
    res.sendError('UnexpectedError', 'wat');
}

function servedByFoo(name) {
    return echoFoo;
    function echoFoo(req, res, arg2, arg3) {
        var str = String(arg3).toUpperCase();
        res.headers.as = 'raw';
        res.sendOk('served by ' + name, str);
    }
}

function fooLolError(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendNotOk('meh', 'lol');
}

function fooStopError(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendNotOk('no', 'stop');
}

// TODO: useful to pull back into alloc-cluster?
function withConnectedClient(chan, cluster, callback) {
    var ready = CountedReadySignal(cluster.channels.length);
    cluster.channels.forEach(function each(server, i) {
        var peer = chan.peers.add(server.hostPort);
        var conn = peer.connect(server.hostPort);
        conn.on('identified', ready.signal);
    });
    ready(callback);
}
