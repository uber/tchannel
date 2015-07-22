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
var Buffer = require('buffer').Buffer;
var allocCluster = require('./lib/alloc-cluster.js');
var EndpointHandler = require('../endpoint-handler');
var TChannel = require('../channel.js');
var CountedReadySignal = require('ready-signal/counted');

allocCluster.test('request().send() to a server', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    one.makeSubChannel({
        serviceName: 'server'
    }).register('foo', function foo(req, res, arg2, arg3) {
        assert.ok(Buffer.isBuffer(arg2), 'handler got an arg2 buffer');
        assert.ok(Buffer.isBuffer(arg3), 'handler got an arg3 buffer');
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    });

    parallel([

        {
            name: 'bufferOp',
            op: Buffer('foo'),
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'stringOp',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'bufferHead',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: Buffer('abc'),
            reqBody: null,
            resHead: 'abc',
            resBody: ''
        },

        {
            name: 'stringHead',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: 'abc',
            reqBody: null,
            resHead: 'abc',
            resBody: ''
        },

        {
            name: 'objectHead',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: JSON.stringify({value: 'abc'}),
            reqBody: null,
            resHead: '{"value":"abc"}',
            resBody: ''
        },

        {
            name: 'nullHead',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'undefinedHead',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: undefined,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'bufferBody',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: Buffer('abc'),
            resHead: '',
            resBody: 'abc'
        },

        {
            name: 'stringBody',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: 'abc',
            resHead: '',
            resBody: 'abc'
        },

        {
            name: 'objectBody',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: JSON.stringify({value: 'abc'}),
            resHead: '',
            resBody: '{"value":"abc"}'
        },

        {
            name: 'nullBody',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'undefinedBody',
            op: 'foo',
            opts: {
                serviceName: 'server'
            },
            reqHead: null,
            reqBody: undefined,
            resHead: '',
            resBody: ''
        },

    ].map(function eachTestCase(testCase) {
        return sendTest(two.subChannels.server, testCase, assert);
    }), function onResults(err) {
        if (err) return assert.end(err);
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
                        {direction: 'out', inReqs: 0, outReqs: 0}
                    ]
                }]
            }]
        });
        assert.end();
    });
});

allocCluster.test('request().send() to a pool of servers', 4, function t(cluster, assert) {
    var client = TChannel({
        timeoutFuzz: 0,
        random: randSeq([
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
            0.1, 1.0, 0.1, 0.1, // .request, chan 2 wins
            0.1, 0.1, 1.0, 0.1, // .request, chan 3 wins
            0.1, 0.1, 0.1, 1.0, // .request, chan 4 wins
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
            0.1, 1.0, 0.1, 0.1, // .request, chan 2 wins
            0.1, 0.1, 1.0, 0.1, // .request, chan 3 wins
            0.1, 0.1, 0.1, 1.0  // .request, chan 4 wins
        ])
    });

    var channel = client.makeSubChannel({
        serviceName: 'lol'
    });

    var ready = CountedReadySignal(cluster.channels.length);

    cluster.channels.forEach(function each(chan, i) {
        var chanNum = i + 1;
        chan.handler = EndpointHandler();
        chan.handler.register('foo', function foo(req, res, arg2, arg3) {
            res.headers.as = 'raw';
            res.sendOk(arg2, arg3 + ' served by ' + chanNum);
        });
        channel.peers.add(chan.hostPort);
        var peer = channel.peers.get(chan.hostPort);
        var conn = peer.connect(chan.hostPort);
        conn.on('identified', ready.signal);
    });

    ready(testIt);

    function testIt() {
        parallel([

            { name: 'msg1', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg1',
              resHead: '', resBody: 'msg1 served by 1' },
            { name: 'msg2', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg2',
              resHead: '', resBody: 'msg2 served by 2' },
            { name: 'msg3', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg3',
              resHead: '', resBody: 'msg3 served by 3' },
            { name: 'msg4', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg4',
              resHead: '', resBody: 'msg4 served by 4' },

            { name: 'msg5', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg5',
              resHead: '', resBody: 'msg5 served by 1' },
            { name: 'msg6', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg6',
              resHead: '', resBody: 'msg6 served by 2' },
            { name: 'msg7', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg7',
              resHead: '', resBody: 'msg7 served by 3' },
            { name: 'msg8', op: 'foo',
              logger: cluster.logger,
              reqHead: '', reqBody: 'msg8',
              resHead: '', resBody: 'msg8 served by 4' },

        ].map(function eachTestCase(testCase) {
            return sendTest(channel, testCase, assert);
        }), function onResults(err) {
            assert.ifError(err, 'no errors from sending');
            cluster.assertCleanState(assert, {
                channels: cluster.channels.map(function each() {
                    return {
                        peers: [{
                            connections: [
                                {direction: 'in', inReqs: 0, outReqs: 0}
                            ]
                        }]
                    };
                })
            });
            client.close();
            assert.end();
        });
    }
});

allocCluster.test('request().send() to self', 1, function t(cluster, assert) {
    var one = cluster.channels[0];

    var subOne = one.makeSubChannel({
        serviceName: 'one'
    });

    subOne.handler.register('foo', function foo(req, res, arg2, arg3) {
        assert.ok(typeof arg2 === 'string', 'handler got an arg2 string');
        assert.ok(typeof arg3 === 'string', 'handler got an arg3 string');
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    });
    subOne.handler.register('bar', function bar(req, res, arg2, arg3) {
        assert.ok(typeof arg2 === 'string', 'handler got an arg2 string');
        assert.ok(typeof arg3 === 'string', 'handler got an arg3 string');
        res.headers.as = 'raw';
        res.sendNotOk(arg2, arg3);
    });

    parallel([
        {
            name: 'msg1', op: 'foo',
            reqHead: 'head1', reqBody: 'msg1',
            resHead: 'head1', resBody: 'msg1',
            opts: {
                host: one.hostPort,
                serviceName: 'one'
            }
        },
        {
            name: 'msg2', op: 'bar',
            reqHead: 'head2', reqBody: 'msg2',
            resHead: 'head2', resBody: 'msg2',
            resOk: false,
            opts: {
                host: one.hostPort,
                serviceName: 'one'
            }
        }
    ].map(function eachTestCase(testCase) {
        return sendTest(subOne, testCase, assert);
    }), function onResults(err) {
        assert.ifError(err, 'no errors from sending');
        cluster.assertCleanState(assert, {
            channels: [{
                peers: []
            }]
        });
        assert.end();
    });
});

allocCluster.test('send to self', {
    numPeers: 1
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var subOne = one.makeSubChannel({
        serviceName: 'one',
        peers: [one.hostPort],
        requestDefaults: {
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    subOne.handler.register('foo', function foo(req, res) {
        res.headers.as = 'raw';
        res.sendOk('', 'bar');
    });

    subOne.request({
        host: one.hostPort,
        serviceName: 'one'
    }).send('foo', '', '', onResponse);

    function onResponse(err, resp, arg2, arg3) {
        assert.ifError(err);

        assert.ok(resp.ok);
        assert.equal(String(arg3), 'bar');

        assert.end();
    }
});

allocCluster.test('send junk transport headers', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'resetting connection');

    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var subOne = one.makeSubChannel({
        serviceName: 'one',
        requestDefaults: {
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    subOne.waitForIdentified({
        host: two.hostPort
    }, onIdentified);

    function onIdentified(err1) {
        assert.ifError(err1);

        subOne.request({
            serviceName: 'one',
            host: two.hostPort,
            headers: {
                foo: undefined
            }
        }).send('foo', '', '', onResponse);

        function onResponse(err2) {
            assert.ok(err2);
            assert.equal(err2.type, 'tchannel.connection.reset');

            assert.equal(err2.message,
                'tchannel: tchannel write failure: invalid ' +
                'header type for header foo; expected string, ' +
                'got undefined'
            );

            assert.end();
        }
    }
});

allocCluster.test('self send() with error frame', 1, function t(cluster, assert) {
    var one = cluster.channels[0];
    var subOne = one.makeSubChannel({
        serviceName: 'one'
    });

    subOne.handler.register('foo', function foo(req, res) {
        res.sendError('Cancelled', 'bye lol');
    });

    subOne.register('unhealthy', function unhealthy(req, res) {
        res.sendError('Unhealthy', 'smallest violin');
    });

    function cancelCase(callback) {
        subOne.request({
            host: one.hostPort,
            serviceName: 'one',
            hasNoParent: true,
            headers: {
                'as': 'raw',
                cn: 'wat'
            }
        }).send('foo', '', '', onResponse);

        function onResponse(err) {
            assert.equal(err.message, 'bye lol');
            assert.deepEqual(err, {
                type: 'tchannel.cancelled',
                fullType: 'tchannel.cancelled',
                isErrorFrame: true,
                codeName: 'Cancelled',
                errorCode: 2,
                originalId: 1,
                name: 'TchannelCancelledError',
                message: 'bye lol'
            });
            callback();
        }
    }

    function unhealthyCase(callback) {
        subOne.request({
            host: one.hostPort,
            serviceName: 'one',
            hasNoParent: true,
            headers: {
                'as': 'raw',
                cn: 'wat'
            }
        }).send('unhealthy', '', '', onResponse);

        function onResponse(err) {
            assert.equal(err.message, 'smallest violin');
            assert.deepEqual(err, {
                type: 'tchannel.unhealthy',
                fullType: 'tchannel.unhealthy',
                isErrorFrame: true,
                codeName: 'Unhealthy',
                errorCode: 8,
                originalId: 2,
                name: 'TchannelUnhealthyError',
                message: 'smallest violin'
            });
            callback();
        }
    }

    parallel([cancelCase, unhealthyCase], assert.end);

});

allocCluster.test('send() with requestDefaults', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var subOne = one.makeSubChannel({
        serviceName: 'one'
    });

    var subTwo = two.makeSubChannel({
        serviceName: 'one',
        requestDefaults: {
            headers: {
                cn: 'foo'
            }
        },
        peers: [one.hostPort]
    });

    subOne.handler.register('foo', function foo(req, res) {
        res.headers.as = 'raw';
        res.sendOk('', req.headers.cn);
    });

    subTwo.request({
        serviceName: 'one',
        hasNoParent: true,
        headers: {
            'as': 'raw',
            cn: 'wat'
        }
    }).send('foo', '', '', onResponse);

    function onResponse(err, resp, arg2, arg3) {
        assert.ifError(err);
        assert.ok(resp.ok);

        assert.equal(String(arg3), 'wat');

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

function sendTest(channel, testCase, assert) {
    return function runSendTest(callback) {
        testCase.opts = testCase.opts || {};
        testCase.opts.hasNoParent = true;
        testCase.opts.headers = {
            'as': 'raw',
            cn: 'wat'
        };

        channel
            .request(testCase.opts)
            .send(testCase.op, testCase.reqHead, testCase.reqBody, onResult);
        function onResult(err, res, arg2, arg3) {
            var head = arg2;
            var body = arg3;
            assert.ifError(err, testCase.name + ': no result error');
            if (!err) {
                assert.ok(typeof head === 'string' || Buffer.isBuffer(head), testCase.name + ': got head buffer or string');
                assert.ok(typeof body === 'string' || Buffer.isBuffer(body), testCase.name + ': got body buffer or string');
                assert.equal(head ? String(head) : head, testCase.resHead, testCase.name + ': expected head content');
                assert.equal(body ? String(body) : body, testCase.resBody, testCase.name + ': expected body content');
            }

            if ('resOk' in testCase) {
                assert.equal(res.ok, testCase.resOk,
                    testCase.name + ': expected res ok');
            }

            callback();
        }
    };
}
