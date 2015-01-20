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

var test = require('tape');
var parallel = require('run-parallel');
var Buffer = require('buffer').Buffer;

var allocCluster = require('./lib/alloc-cluster.js');

test('register() with different results', function t(assert) {
    var cluster = allocCluster();
    var one = cluster.one;

    one.register('/error', function error(h, b, hi, cb) {
        cb(new Error('abc'));
    });

    one.register('/buffer-head', function buffer(h, b, hi, cb) {
        cb(null, new Buffer('abc'), null);
    });
    one.register('/string-head', function string(h, b, hi, cb) {
        cb(null, 'abc', null);
    });
    one.register('/object-head', function object(h, b, hi, cb) {
        cb(null, { value: 'abc' }, null);
    });
    one.register('/null-head', function nullH(h, b, hi, cb) {
        cb(null, null, null);
    });
    one.register('/undef-head', function undefH(h, b, hi, cb) {
        cb(null, undefined, null);
    });

    one.register('/buffer-body', function buffer(h, b, hi, cb) {
        cb(null, null, new Buffer('abc'));
    });
    one.register('/string-body', function string(h, b, hi, cb) {
        cb(null, null, 'abc');
    });
    one.register('/object-body', function object(h, b, hi, cb) {
        cb(null, null, { value: 'abc' });
    });
    one.register('/null-body', function nullB(h, b, hi, cb) {
        cb(null, null, null);
    });
    one.register('/undef-body', function undefB(h, b, hi, cb) {
        cb(null, null, undefined);
    });

    parallel({
        'errorCall': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/error'),

        'bufferHead': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/buffer-head'),
        'stringHead': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/string-head'),
        'objectHead': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/object-head'),
        'nullHead': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/null-head'),
        'undefHead': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/undef-head'),

        'bufferBody': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/buffer-body'),
        'stringBody': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/string-body'),
        'objectBody': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/object-body'),
        'nullBody': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/null-body'),
        'undefBody': sendCall.bind(null, cluster.two, {
            host: cluster.hosts.one
        }, '/undef-body')
    }, onResults);

    function onResults(err, results) {
        assert.ifError(err);

        var errorCall = results.errorCall;
        assert.ok(errorCall.err);
        assert.equal(errorCall.err.message, 'abc');
        assert.equal(errorCall.head, null);
        assert.equal(errorCall.body, null);

        var bufferHead = results.bufferHead;
        assert.equal(bufferHead.err, null);
        assert.ok(Buffer.isBuffer(bufferHead.head));
        assert.equal(String(bufferHead.head), 'abc');
        assert.ok(Buffer.isBuffer(bufferHead.body));
        assert.equal(String(bufferHead.body), '');

        var stringHead = results.stringHead;
        assert.equal(stringHead.err, null);
        assert.ok(Buffer.isBuffer(stringHead.head));
        assert.equal(String(stringHead.head), 'abc');
        assert.ok(Buffer.isBuffer(stringHead.body));
        assert.equal(String(stringHead.body), '');

        var objectHead = results.objectHead;
        assert.equal(objectHead.err, null);
        assert.ok(Buffer.isBuffer(objectHead.head));
        assert.equal(String(objectHead.head), '{"value":"abc"}');
        assert.ok(Buffer.isBuffer(objectHead.body));
        assert.equal(String(objectHead.body), '');

        var nullHead = results.nullHead;
        assert.equal(nullHead.err, null);
        assert.ok(Buffer.isBuffer(nullHead.head));
        assert.equal(String(nullHead.head), '');
        assert.ok(Buffer.isBuffer(nullHead.body));
        assert.equal(String(nullHead.body), '');

        var undefHead = results.undefHead;
        assert.equal(undefHead.err, null);
        assert.ok(Buffer.isBuffer(undefHead.head));
        assert.equal(String(undefHead.head), '');
        assert.ok(Buffer.isBuffer(undefHead.body));
        assert.equal(String(undefHead.body), '');

        var bufferBody = results.bufferBody;
        assert.equal(bufferBody.err, null);
        assert.ok(Buffer.isBuffer(bufferBody.head));
        assert.equal(String(bufferBody.head), '');
        assert.ok(Buffer.isBuffer(bufferBody.body));
        assert.equal(String(bufferBody.body), 'abc');

        var stringBody = results.stringBody;
        assert.equal(stringBody.err, null);
        assert.ok(Buffer.isBuffer(stringBody.head));
        assert.equal(String(stringBody.head), '');
        assert.ok(Buffer.isBuffer(stringBody.body));
        assert.equal(String(stringBody.body), 'abc');

        var objectBody = results.objectBody;
        assert.equal(objectBody.err, null);
        assert.ok(Buffer.isBuffer(objectBody.head));
        assert.equal(String(objectBody.head), '');
        assert.ok(Buffer.isBuffer(objectBody.body));
        assert.equal(String(objectBody.body), '{"value":"abc"}');

        var nullBody = results.nullBody;
        assert.equal(nullBody.err, null);
        assert.ok(Buffer.isBuffer(nullBody.head));
        assert.equal(String(nullBody.head), '');
        assert.ok(Buffer.isBuffer(nullBody.body));
        assert.equal(String(nullBody.body), '');

        var undefBody = results.undefBody;
        assert.equal(undefBody.err, null);
        assert.ok(Buffer.isBuffer(undefBody.head));
        assert.equal(String(undefBody.head), '');
        assert.ok(Buffer.isBuffer(undefBody.body));
        assert.equal(String(undefBody.body), '');

        cluster.destroy();
        assert.end();
    }
});

function sendCall(channel, opts, op, cb) {
    channel.send(opts, op, null, null, onResult);

    function onResult(err, res1, res2) {
        cb(null, {
            err: err,
            head: res1,
            body: res2
        });
    }
}
