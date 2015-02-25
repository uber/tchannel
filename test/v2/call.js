// Copyright (c) 2015 Uber Technologies, Inc.

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
var testRead = require('../lib/read_test.js');
var Call = require('../../v2/call.js');

var testCallReq = Buffer([
    0x00,                   // flags:1
    0x00, 0x00, 0x04, 0x00, // ttl:4
    0x00, 0x01, 0x02, 0x03, // tracing:24
    0x04, 0x05, 0x06, 0x07, // ...
    0x08, 0x09, 0x0a, 0x0b, // ...
    0x0c, 0x0d, 0x0e, 0x0f, // ...
    0x10, 0x11, 0x12, 0x13, // ...
    0x14, 0x15, 0x16, 0x17, // ...
    0x18,                   // traceflags:1
    0x00, 0x06,             // service~2
    0x61, 0x70, 0x61, 0x63, // ...
    0x68, 0x65,             // ...
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // (hk~1 hv~1){nh}
    0x03, 0x76, 0x61, 0x6c, // ...
    0x00,                   // csumtype:1 (csum:4){0,1}
    0x00, 0x02, 0x6f, 0x6e, // arg1~2
    0x00, 0x02, 0x74, 0x6f, // arg2~2
    0x00, 0x02, 0x74, 0x65  // arg3~2
]);

var testTracing = Buffer([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
    0x18
]);

test('read a Call.Request', function t(assert) {
    testRead(assert, Call.Request.read, testCallReq, function s(req, done) {
        assert.equal(req.flags, 0, 'expected flags');
        assert.equal(req.ttl, 1024, 'expected ttl');
        assert.deepEqual(req.tracing, testTracing, 'expected tracing data');
        assert.equal(String(req.service), 'apache', 'expected service');
        assert.equal(Object.keys(req.headers).length, 1, 'expected one header');
        assert.equal(req.headers.key, 'val', 'expected header key => val');
        assert.equal(req.csum.type, 0, 'expected no checksum');
        assert.equal(String(req.arg1), 'on', 'expected arg1');
        assert.equal(String(req.arg2), 'to', 'expected arg2');
        assert.equal(String(req.arg3), 'te', 'expected arg3');
        done();
    });
});

test('write a Call.Request', function t(assert) {
    var req = Call.Request(
        0, 1024, testTracing, 'apache', {key: 'val'},
        0, 'on', 'to', 'te');
    assert.deepEqual(
        req.write().create(), testCallReq,
        'expected write output');
    assert.end();
});

var testCallRes = Buffer([
    0x00,                   // flags:1
    Call.Response.Codes.OK, // code:1
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // (hk~1 hv~1){nh}
    0x03, 0x76, 0x61, 0x6c, // ...
    0x00,                   // csumtype:1 (csum:4){0,1}
    0x00, 0x02, 0x6f, 0x6e, // arg1~2
    0x00, 0x02, 0x74, 0x6f, // arg2~2
    0x00, 0x02, 0x74, 0x65  // arg3~2
]);

test('read a Call.Response', function t(assert) {
    testRead(assert, Call.Response.read, testCallRes, function s(res, done) {
        assert.equal(res.flags, 0, 'expected flags');
        assert.equal(res.code, Call.Response.Codes.OK, 'expected code');
        assert.equal(Object.keys(res.headers).length, 1, 'expected one header');
        assert.equal(res.headers.key, 'val', 'expected header key => val');
        assert.equal(res.csum.type, 0, 'expected no checksum');
        assert.equal(String(res.arg1), 'on', 'expected arg1');
        assert.equal(String(res.arg2), 'to', 'expected arg2');
        assert.equal(String(res.arg3), 'te', 'expected arg3');
        done();
    });
});

test('write a Call.Response', function t(assert) {
    var req = Call.Response(
        0, Call.Response.Codes.OK, {key: 'val'},
        0, 'on', 'to', 'te');
    assert.deepEqual(
        req.write().create(), testCallRes,
        'expected write output');
    assert.end();
});
