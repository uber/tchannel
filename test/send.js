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
var extend = require('xtend');
var allocCluster = require('./lib/alloc-cluster.js');
var EndpointHandler = require('../endpoint-handler');
var TChannel = require('../index.js');

allocCluster.test('request().send() to a server', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];

    one.handler = EndpointHandler();

    one.handler.register('foo', function foo(req, res, arg2, arg3) {
        assert.ok(Buffer.isBuffer(arg2), 'handler got an arg2 buffer');
        assert.ok(Buffer.isBuffer(arg3), 'handler got an arg3 buffer');
        res.sendOk(arg2, arg3);
    });

    parallel([

        {
            name: 'bufferOp',
            op: Buffer('foo'),
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'stringOp',
            op: 'foo',
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'bufferHead',
            op: 'foo',
            reqHead: Buffer('abc'),
            reqBody: null,
            resHead: 'abc',
            resBody: ''
        },

        {
            name: 'stringHead',
            op: 'foo',
            reqHead: 'abc',
            reqBody: null,
            resHead: 'abc',
            resBody: ''
        },

        {
            name: 'objectHead',
            op: 'foo',
            reqHead: JSON.stringify({value: 'abc'}),
            reqBody: null,
            resHead: '{"value":"abc"}',
            resBody: ''
        },

        {
            name: 'nullHead',
            op: 'foo',
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'undefinedHead',
            op: 'foo',
            reqHead: undefined,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'bufferBody',
            op: 'foo',
            reqHead: null,
            reqBody: Buffer('abc'),
            resHead: '',
            resBody: 'abc'
        },

        {
            name: 'stringBody',
            op: 'foo',
            reqHead: null,
            reqBody: 'abc',
            resHead: '',
            resBody: 'abc'
        },

        {
            name: 'objectBody',
            op: 'foo',
            reqHead: null,
            reqBody: JSON.stringify({value: 'abc'}),
            resHead: '',
            resBody: '{"value":"abc"}'
        },

        {
            name: 'nullBody',
            op: 'foo',
            reqHead: null,
            reqBody: null,
            resHead: '',
            resBody: ''
        },

        {
            name: 'undefinedBody',
            op: 'foo',
            reqHead: null,
            reqBody: undefined,
            resHead: '',
            resBody: ''
        },

    ].map(function eachTestCase(testCase) {
        testCase = extend({
            channel: two,
            opts: {host: hostOne},
        }, testCase);
        return sendTest(testCase, assert);
    }), function onResults(err) {
        assert.ifError(err, 'no errors from sending');
        cluster.assertCleanState(assert, {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inOps: 0, outOps: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'out', inOps: 0, outOps: 0}
                    ]
                }]
            }]
        });
        assert.end();
    });
});

allocCluster.test('request().send() to a pool of servers', 4, function t(cluster, assert) {
    var client = TChannel({
        random: randSeq([
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
            0.0,                // timeout fuzz
            0.1, 1.0, 0.1, 0.1, // .request, chan 2 wins
            0.0,                // timeout fuzz
            0.1, 0.1, 1.0, 0.1, // .request, chan 3 wins
            0.0,                // timeout fuzz
            0.1, 0.1, 0.1, 1.0, // .request, chan 4 wins
            0.0,                // timeout fuzz
            1.0, 0.1, 0.1, 0.1, // .request, chan 1 wins
            0.1, 1.0, 0.1, 0.1, // .request, chan 2 wins
            0.1, 0.1, 1.0, 0.1, // .request, chan 3 wins
            0.1, 0.1, 0.1, 1.0  // .request, chan 4 wins
        ])
    });

    cluster.channels.forEach(function each(chan, i) {
        var chanNum = i + 1;
        chan.handler = EndpointHandler();
        chan.handler.register('foo', function foo(req, res, arg2, arg3) {
            res.sendOk(arg2, arg3 + ' served by ' + chanNum);
        });
        client.peers.add(chan.hostPort);
    });

    parallel([

        { name: 'msg1', op: 'foo',
          reqHead: '', reqBody: 'msg1',
          resHead: '', resBody: 'msg1 served by 1' },
        { name: 'msg2', op: 'foo',
          reqHead: '', reqBody: 'msg2',
          resHead: '', resBody: 'msg2 served by 2' },
        { name: 'msg3', op: 'foo',
          reqHead: '', reqBody: 'msg3',
          resHead: '', resBody: 'msg3 served by 3' },
        { name: 'msg4', op: 'foo',
          reqHead: '', reqBody: 'msg4',
          resHead: '', resBody: 'msg4 served by 4' },

        { name: 'msg5', op: 'foo',
          reqHead: '', reqBody: 'msg5',
          resHead: '', resBody: 'msg5 served by 1' },
        { name: 'msg6', op: 'foo',
          reqHead: '', reqBody: 'msg6',
          resHead: '', resBody: 'msg6 served by 2' },
        { name: 'msg7', op: 'foo',
          reqHead: '', reqBody: 'msg7',
          resHead: '', resBody: 'msg7 served by 3' },
        { name: 'msg8', op: 'foo',
          reqHead: '', reqBody: 'msg8',
          resHead: '', resBody: 'msg8 served by 4' },

    ].map(function eachTestCase(testCase) {
        return sendTest(extend({
            logger: cluster.logger,
            channel: client
        }, testCase), assert);
    }), function onResults(err) {
        assert.ifError(err, 'no errors from sending');
        cluster.assertCleanState(assert, {
            channels: cluster.channels.map(function each() {
                return {
                    peers: [{
                        connections: [
                            {direction: 'in', inOps: 0, outOps: 0}
                        ]
                    }]
                };
            })
        });
        assert.end();
    });
});

function randSeq(seq) {
    var i = 0;
    return function random() {
        var r = seq[i];
        i = (i + 1) % seq.length;
        return r;
    };
}

function sendTest(testCase, assert) {
    return function runSendTest(callback) {
        testCase.channel
            .request(testCase.opts)
            .send(testCase.op, testCase.reqHead, testCase.reqBody, onResult);
        function onResult(err, res, arg2, arg3) {
            var head = arg2;
            var body = arg3;
            assert.ifError(err, testCase.name + ': no result error');
            if (!err) {
                assert.ok(Buffer.isBuffer(head), testCase.name + ': got head buffer');
                assert.ok(Buffer.isBuffer(body), testCase.name + ': got body buffer');
                assert.equal(head ? String(head) : head, testCase.resHead, testCase.name + ': expected head content');
                assert.equal(body ? String(body) : body, testCase.resBody, testCase.name + ': expected body content');
            }
            callback();
        }
    };
}
