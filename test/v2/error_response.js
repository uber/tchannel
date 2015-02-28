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
var ErrorResponse = require('../../v2/error_response.js');

var testErrorResponse = Buffer([
    ErrorResponse.Codes.ProtocolError, // code:1
    0x01, 0x02, 0x03, 0x04,            // id:4
    0x00, 0x08, 0x74, 0x6f,            // message~2
    0x6f, 0x20, 0x62, 0x61,            // ...
    0x64, 0x2e                         // ...
]);

test('read a ErrorResponse', function t(assert) {
    testRead(assert, ErrorResponse.read, testErrorResponse, function s(res, done) {
        assert.equal(res.code, ErrorResponse.Codes.ProtocolError, 'expected code');
        assert.equal(res.id, 0x01020304, 'expected id');
        assert.equal(String(res.message), 'too bad.', 'expected message');
        done();
    });
});

test('write a ErrorResponse', function t(assert) {
    var res = ErrorResponse(
        ErrorResponse.Codes.ProtocolError,
        0x01020304, 'too bad.');
    assert.deepEqual(
        res.write().create(), testErrorResponse,
        'expected write output');
    assert.end();
});
