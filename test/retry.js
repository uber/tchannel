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

var series = require('run-series');
var allocCluster = require('./lib/alloc-cluster');
var TChannel = require('../channel');

allocCluster.test('request retries', {
    numPeers: 4
}, function t(cluster, assert) {
    var random = randSeq([
        1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
        1.0,                // chan 1 declines
             1.0, 0.1, 0.1, // .request, chan 2 wins (1 is skipped)
        0.25,               // chan 2 too busy
                  1.0, 0.1, // .request, chan 3 wins (1-2 are skipped)
        0.1,                // chan 3 unexpected error
                       0.1, // .request, chan 4 wins (only one left)
        0.0                 // success!
    ]);

    cluster.channels.forEach(function each(server, i) {
        var n = i + 1;
        var chan = server.makeSubChannel({
            serviceName: 'tristan'
        });
        chan.register('foo', function foo(req, res, arg2, arg3) {
            var rand = random();
            if (rand >= 0.5) {
                res.sendError('Declined', 'magic 8-ball says no');
            } else if (rand >= 0.25) {
                res.sendError('Busy', "can't talk");
            } else if (rand) {
                res.sendError('UnexpectedError', 'wat');
            } else {
                var str = String(arg3);
                str = str.toUpperCase();
                res.headers.as = 'raw';
                res.sendOk('served by ' + n, str);
            }
        });
    });

    var client = TChannel({
        timeoutFuzz: 0,
        random: random
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

    var req = chan.request({
        hasNoParent: true,
        timeout: 100
    });
    req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
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
    });

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
    numPeers: 4
}, function t(cluster, assert) {
    var random = randSeq([
        1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
        1.0,                // chan 1 has applicatino error
             1.0, 0.1, 0.1, // .request, chan 2 wins (1 is skipped)
        0.0                 // "success"!
    ]);

    cluster.channels.forEach(function each(server, i) {
        var chan = server.makeSubChannel({
            serviceName: 'tristan'
        });
        chan.register('foo', function foo(req, res, arg2, arg3) {
            var rand = random();
            res.headers.as = 'raw';
            if (rand) {
                res.sendNotOk('meh', 'lol');
            } else {
                res.sendNotOk('no', 'stop');
            }
        });
    });

    var client = TChannel({
        timeoutFuzz: 0,
        random: random
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

    var req = chan.request({
        timeout: 100,
        hasNoParent: true,
        shouldApplicationRetry: function shouldApplicationRetry(req, res, retry, done) {
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
    });
    req.send('foo', '', 'hi', function done(err, res, arg2, arg3) {
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
    });

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
    var random = randSeq([
        1.0, 0.1, // .request, chan 1 wins
        0.5,      // chan 1 timeout

        1.0, 0.1, // .request, chan 1 wins
        0.5,      // chan 1 timeout
             1.0, // .request, chan 2 wins (1 is skipped)
        0.0,      // success!

        1.0, 0.1, // .request, chan 1 wins
        0.9       // chan 1 busy

    ]);

    cluster.channels.forEach(function each(server, i) {
        var n = i + 1;
        var chan = server.makeSubChannel({
            serviceName: 'tristan'
        });
        chan.register('foo', function foo(req, res, arg2, arg3) {
            var rand = random();
            res.headers.as = 'raw';
            if (rand >= 0.9) {
                res.sendError('Busy', 'nop');
            } else if (rand >= 0.5) {
                res.sendError('Timeout', 'no luck');
            } else {
                var str = String(arg3);
                str = str.toUpperCase();
                res.sendOk('served by ' + n, str);
            }
        });
    });

    var client = TChannel({
        timeoutFuzz: 0,
        random: random
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
        function canRetryTimeout(next) {
            var req = chan.request({
                hasNoParent: true,
                retryFlags: {
                    never: false,
                    onConnectionError: true
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

function randSeq(seq) {
    var i = 0;
    return function random() {
        var r = seq[i];
        i = (i + 1) % seq.length;
        return r;
    };
}
