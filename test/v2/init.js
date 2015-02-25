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
var testRead = require('../lib/readTest.js');
var Init = require('../../v2/init.js');

var testInitReq = Buffer([
    0x00, 0x02,             // version:2

    0x00, 0x09, 0x68, 0x6f, // key~2 -- host_port
    0x73, 0x74, 0x5f, 0x70, // ...
    0x6f, 0x72, 0x74,       // ...

    0x00, 0x09, 0x31, 0x2e, // value~2 -- 1.2.3.4:5
    0x32, 0x2e, 0x33, 0x2e, // ...
    0x34, 0x3a, 0x35,       // ...

    0x00, 0x0c, 0x70, 0x72, // key~2 -- process_name
    0x6f, 0x63, 0x65, 0x73, // ...
    0x73, 0x5f, 0x6e, 0x61, // ...
    0x6d, 0x65,             // ...

    0x00, 0x04, 0x6e, 0x6f, // value~2 -- node
    0x64, 0x65              // ...

]);

test('read a Init.Request', function t(assert) {
    testRead(assert, Init.Request.read, testInitReq, function s(req) {
        assert.equal(req.version, 2, 'expected version');
        assert.equal(req.hostPort, '1.2.3.4:5', 'expected hostPort');
        assert.equal(req.processName, 'node', 'expected processName');
    });
});

test('write a Init.Request', function t(assert) {
    var req = Init.Request(2, '1.2.3.4:5', 'node');
    assert.deepEqual(
        req.write().create(), testInitReq,
        'expected write output');
    assert.end();
});

test('read a Init.Response', function t(assert) {
    testRead(assert, Init.Response.read, testInitReq, function s(req) {
        assert.equal(req.version, 2, 'expected version');
        assert.equal(req.hostPort, '1.2.3.4:5', 'expected hostPort');
        assert.equal(req.processName, 'node', 'expected processName');
    });
});

test('write a Init.Response', function t(assert) {
    var req = Init.Response(2, '1.2.3.4:5', 'node');
    assert.deepEqual(
        req.write().create(), testInitReq,
        'expected write output');
    assert.end();
});
