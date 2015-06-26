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

allocCluster.test('register() with different results', {
    numPeers: 2,
    channelOptions: {
        requestDefaults: {
            timeout: 100,
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var twoSub = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    var oneSub = one.makeSubChannel({
        serviceName: 'server'
    });

    oneSub.register('/error', function error(req, res) {
        res.headers.as = 'raw';
        res.sendNotOk(null, 'abc');
    });

    oneSub.register('/error-frame', function errorFrame(req, res) {
        res.headers.as = 'raw';
        res.sendError('Busy', 'some message');
    });

    oneSub.register('/buffer-head', function buffer(req, res) {
        res.headers.as = 'raw';
        res.sendOk(new Buffer('abc'), null);
    });
    oneSub.register('/string-head', function string(req, res) {
        res.headers.as = 'raw';
        res.sendOk('abc', null);
    });
    oneSub.register('/object-head', function object(req, res) {
        res.headers.as = 'raw';
        res.sendOk(JSON.stringify({ value: 'abc' }), null);
    });
    oneSub.register('/null-head', function nullH(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, null);
    });
    oneSub.register('/undef-head', function undefH(req, res) {
        res.headers.as = 'raw';
        res.sendOk(undefined, null);
    });

    oneSub.register('/buffer-body', function buffer(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, new Buffer('abc'));
    });
    oneSub.register('/string-body', function string(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, 'abc');
    });
    oneSub.register('/object-body', function object(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, JSON.stringify({ value: 'abc' }));
    });
    oneSub.register('/null-body', function nullB(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, null);
    });
    oneSub.register('/undef-body', function undefB(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, undefined);
    });

    parallel({
        'errorCall': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/error'),
        'errorFrameCall': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/error-frame'),

        'bufferHead': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/buffer-head'),
        'stringHead': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/string-head'),
        'objectHead': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/object-head'),
        'nullHead': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/null-head'),
        'undefHead': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/undef-head'),

        'bufferBody': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/buffer-body'),
        'stringBody': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/string-body'),
        'objectBody': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/object-body'),
        'nullBody': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/null-body'),
        'undefBody': sendCall.bind(null, twoSub, {
            serviceName: 'server'
        }, '/undef-body')
    }, onResults);

    function onResults(err, results) {
        assert.ifError(err);

        var errorCall = results.errorCall;
        assert.equal(errorCall.error, null);
        assert.ok(Buffer.isBuffer(errorCall.head));
        assert.equal(String(errorCall.head), '');
        assert.ok(Buffer.isBuffer(errorCall.body));
        assert.equal(String(errorCall.body), 'abc');

        var errorFrameCall = results.errorFrameCall;
        var frameErr = errorFrameCall.error;
        assert.equal(frameErr.type, 'tchannel.busy');
        assert.equal(frameErr.isErrorFrame, true);
        assert.equal(frameErr.errorCode, 3);
        assert.equal(typeof frameErr.originalId, 'number');
        assert.equal(frameErr.message, 'some message');
        assert.equal(errorFrameCall.head || null, null);
        assert.equal(errorFrameCall.body || null, null);

        var bufferHead = results.bufferHead;
        assert.equal(bufferHead.error, null);
        assert.ok(Buffer.isBuffer(bufferHead.head));
        assert.equal(String(bufferHead.head), 'abc');
        assert.ok(Buffer.isBuffer(bufferHead.body));
        assert.equal(String(bufferHead.body), '');

        var stringHead = results.stringHead;
        assert.equal(stringHead.error, null);
        assert.ok(Buffer.isBuffer(stringHead.head));
        assert.equal(String(stringHead.head), 'abc');
        assert.ok(Buffer.isBuffer(stringHead.body));
        assert.equal(String(stringHead.body), '');

        var objectHead = results.objectHead;
        assert.equal(objectHead.error, null);
        assert.ok(Buffer.isBuffer(objectHead.head));
        assert.equal(String(objectHead.head), '{"value":"abc"}');
        assert.ok(Buffer.isBuffer(objectHead.body));
        assert.equal(String(objectHead.body), '');

        var nullHead = results.nullHead;
        assert.equal(nullHead.error, null);
        assert.ok(Buffer.isBuffer(nullHead.head));
        assert.equal(String(nullHead.head), '');
        assert.ok(Buffer.isBuffer(nullHead.body));
        assert.equal(String(nullHead.body), '');

        var undefHead = results.undefHead;
        assert.equal(undefHead.error, null);
        assert.ok(Buffer.isBuffer(undefHead.head));
        assert.equal(String(undefHead.head), '');
        assert.ok(Buffer.isBuffer(undefHead.body));
        assert.equal(String(undefHead.body), '');

        var bufferBody = results.bufferBody;
        assert.equal(bufferBody.error, null);
        assert.ok(Buffer.isBuffer(bufferBody.head));
        assert.equal(String(bufferBody.head), '');
        assert.ok(Buffer.isBuffer(bufferBody.body));
        assert.equal(String(bufferBody.body), 'abc');

        var stringBody = results.stringBody;
        assert.equal(stringBody.error, null);
        assert.ok(Buffer.isBuffer(stringBody.head));
        assert.equal(String(stringBody.head), '');
        assert.ok(Buffer.isBuffer(stringBody.body));
        assert.equal(String(stringBody.body), 'abc');

        var objectBody = results.objectBody;
        assert.equal(objectBody.error, null);
        assert.ok(Buffer.isBuffer(objectBody.head));
        assert.equal(String(objectBody.head), '');
        assert.ok(Buffer.isBuffer(objectBody.body));
        assert.equal(String(objectBody.body), '{"value":"abc"}');

        var nullBody = results.nullBody;
        assert.equal(nullBody.error, null);
        assert.ok(Buffer.isBuffer(nullBody.head));
        assert.equal(String(nullBody.head), '');
        assert.ok(Buffer.isBuffer(nullBody.body));
        assert.equal(String(nullBody.body), '');

        var undefBody = results.undefBody;
        assert.equal(undefBody.error, null);
        assert.ok(Buffer.isBuffer(undefBody.head));
        assert.equal(String(undefBody.head), '');
        assert.ok(Buffer.isBuffer(undefBody.body));
        assert.equal(String(undefBody.body), '');

        assert.end();
    }
});

function sendCall(channel, opts, op, cb) {
    opts.hasNoParent = true;

    channel
        .request(opts)
        .send(op, null, null, onResult);

    function onResult(err, res, arg2, arg3) {
        cb(null, {
            error: err,
            head: arg2,
            body: arg3
        });
    }
}
