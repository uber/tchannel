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

var Buffer = require('buffer').Buffer;
var test = require('tape');
var testRW = require('bufrw/test_rw');

var TestBody = require('./test_body.js');
var Frame = require('../../v2/frame.js');
var LazyFrame = require('../../v2/lazy_frame.js');

var Bytes = [
    0x00, 0x15,             // size: 2
    0x03,                   // type: 1
    0x00,                   // reserved:1
    0x00, 0x00, 0x00, 0x01, // id:4
    0x00, 0x00, 0x00, 0x00, // reserved:4
    0x00, 0x00, 0x00, 0x00, // reserved:4

    0x04, 0x64, 0x6f, 0x67, 0x65 // junk bytes
];
var lazyFrame = new LazyFrame(
    0x15, 0x03, 0x01,
    new Buffer(Bytes)
);
lazyFrame.bodyRW = Frame.Types[0x03].RW;

test('LazyFrame.RW: read/write', testRW.cases(LazyFrame.RW, [
    [
        lazyFrame, Bytes
    ]
]));

TestBody.testWith('LazyFrame.readBody', function t(assert) {
    var frame = LazyFrame.RW.readFrom(new Buffer([
        0x00, 0x15,             // size: 2
        0x00,                   // type: 1
        0x00,                   // reserved:1
        0x00, 0x00, 0x00, 0x01, // id:4
        0x00, 0x00, 0x00, 0x00, // reserved:4
        0x00, 0x00, 0x00, 0x00, // reserved:4

        0x04, 0x64, 0x6f, 0x67, 0x65 // junk bytes
    ]), 0).value;

    assert.equal(frame.type, 0x00);

    var bodyRes = frame.readBody();
    assert.ok(bodyRes.value);

    assert.deepEqual(
        bodyRes.value.payload, new Buffer([0x64, 0x6f, 0x67, 0x65])
    );

    assert.end();
});

TestBody.testWith('LazyFrame.setId', function t(assert) {
    var frame = LazyFrame.RW.readFrom(new Buffer([
        0x00, 0x15,             // size: 2
        0x00,                   // type: 1
        0x00,                   // reserved:1
        0x00, 0x00, 0x00, 0x01, // id:4
        0x00, 0x00, 0x00, 0x00, // reserved:4
        0x00, 0x00, 0x00, 0x00, // reserved:4

        0x04, 0x64, 0x6f, 0x67, 0x65 // junk bytes
    ]), 0).value;

    assert.equal(frame.id, 0x01);

    frame.setId(4);

    assert.equal(frame.id, 0x04);

    var buffer = new Buffer(frame.size);
    LazyFrame.RW.writeInto(frame, buffer, 0);

    assert.deepEqual(
        buffer,
        new Buffer([
            0x00, 0x15,             // size: 2
            0x00,                   // type: 1
            0x00,                   // reserved:1
            0x00, 0x00, 0x00, 0x04, // id:4
            0x00, 0x00, 0x00, 0x00, // reserved:4
            0x00, 0x00, 0x00, 0x00, // reserved:4

            0x04, 0x64, 0x6f, 0x67, 0x65 // junk bytes
        ])
    );

    assert.end();
});
