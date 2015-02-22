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

test('send() to a server', function t(assert) {
    var cluster = allocCluster(2);
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];

    one.register('foo', function foo(h, b, hi, cb) {
        assert.ok(Buffer.isBuffer(h));
        assert.ok(Buffer.isBuffer(b));
        cb(null, h, b);
    });

    parallel({
        'bufferOp': sendRes.bind(null, two, {
            host: hostOne
        }, new Buffer('foo'), null, null),
        'stringOp': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, null),
        'bufferHead': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', new Buffer('abc'), null),
        'stringHead': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', 'abc', null),
        'objectHead': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', JSON.stringify({ value: 'abc' }), null),
        'nullHead': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, null),
        'undefinedHead': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', undefined, null),
        'bufferBody': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, new Buffer('abc')),
        'stringBody': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, 'abc'),
        'objectBody': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, JSON.stringify({ value: 'abc' })),
        'nullBody': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, null),
        'undefinedBody': sendRes.bind(null, two, {
            host: hostOne
        }, 'foo', null, undefined)
    }, function onResults(err, results) {
        assert.ifError(err);

        var stringOp = results.stringOp;
        assert.ok(Buffer.isBuffer(stringOp.head));
        assert.equal(stringOp.head.length, 0);
        assert.ok(Buffer.isBuffer(stringOp.body));
        assert.equal(stringOp.body.length, 0);

        var bufferOp = results.bufferOp;
        assert.ok(Buffer.isBuffer(bufferOp.head));
        assert.equal(bufferOp.head.length, 0);
        assert.ok(Buffer.isBuffer(bufferOp.body));
        assert.equal(bufferOp.body.length, 0);

        var bufferHead = results.bufferHead;
        assert.ok(Buffer.isBuffer(bufferHead.head));
        assert.equal(String(bufferHead.head), 'abc');
        assert.ok(Buffer.isBuffer(bufferHead.body));
        assert.equal(bufferHead.body.length, 0);

        var stringHead = results.stringHead;
        assert.ok(Buffer.isBuffer(stringHead.head));
        assert.equal(String(stringHead.head), 'abc');
        assert.ok(Buffer.isBuffer(stringHead.body));
        assert.equal(stringHead.body.length, 0);

        var objectHead = results.objectHead;
        assert.ok(Buffer.isBuffer(objectHead.head));
        assert.equal(String(objectHead.head), '{"value":"abc"}');
        assert.ok(Buffer.isBuffer(objectHead.body));
        assert.equal(objectHead.body.length, 0);

        var nullHead = results.nullHead;
        assert.ok(Buffer.isBuffer(nullHead.head));
        assert.equal(String(nullHead.head), '');
        assert.ok(Buffer.isBuffer(nullHead.body));
        assert.equal(nullHead.body.length, 0);

        var undefinedHead = results.undefinedHead;
        assert.ok(Buffer.isBuffer(undefinedHead.head));
        assert.equal(String(undefinedHead.head), '');
        assert.ok(Buffer.isBuffer(undefinedHead.body));
        assert.equal(undefinedHead.body.length, 0);

        var bufferBody = results.bufferBody;
        assert.ok(Buffer.isBuffer(bufferBody.head));
        assert.equal(String(bufferBody.head), '');
        assert.ok(Buffer.isBuffer(bufferBody.body));
        assert.equal(String(bufferBody.body), 'abc');

        var stringBody = results.stringBody;
        assert.ok(Buffer.isBuffer(stringBody.head));
        assert.equal(String(stringBody.head), '');
        assert.ok(Buffer.isBuffer(stringBody.body));
        assert.equal(String(stringBody.body), 'abc');

        var objectBody = results.objectBody;
        assert.ok(Buffer.isBuffer(objectBody.head));
        assert.equal(String(objectBody.head), '');
        assert.ok(Buffer.isBuffer(objectBody.body));
        assert.equal(String(objectBody.body), '{"value":"abc"}');

        var nullBody = results.nullBody;
        assert.ok(Buffer.isBuffer(nullBody.head));
        assert.equal(String(nullBody.head), '');
        assert.ok(Buffer.isBuffer(nullBody.body));
        assert.equal(String(nullBody.body), '');

        var undefinedBody = results.undefinedBody;
        assert.ok(Buffer.isBuffer(undefinedBody.head));
        assert.equal(String(undefinedBody.head), '');
        assert.ok(Buffer.isBuffer(undefinedBody.body));
        assert.equal(String(undefinedBody.body), '');

        cluster.destroy(assert.end);
    });
});

/*eslint max-params: [2, 6] */
/*jshint maxparams: 6 */
function sendRes(channel, opts, op, h, b, cb) {
    channel.send(opts, op, h, b, onResult);

    function onResult(err, res1, res2) {
        cb(err, {
            head: res1,
            body: res2
        });
    }
}
