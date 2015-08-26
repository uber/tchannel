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
var bufrw = require('bufrw');
var test = require('tape');
var testRW = require('bufrw/test_rw');

var TestBody = require('./lib/test_body.js');
var v2 = require('../../v2/index.js');

var Bytes = [
    0x00, 0x15,             // size: 2
    0x03,                   // type: 1
    0x00,                   // reserved:1
    0x00, 0x00, 0x00, 0x01, // id:4
    0x00, 0x00, 0x00, 0x00, // reserved:4
    0x00, 0x00, 0x00, 0x00, // reserved:4

    0x04, 0x64, 0x6f, 0x67, 0x65 // junk bytes
];
var lazyFrame = new v2.LazyFrame(
    0x15, 0x03, 0x01,
    new Buffer(Bytes)
);
lazyFrame.bodyRW = v2.Frame.Types[0x03].RW;

test('LazyFrame.RW: read/write', testRW.cases(v2.LazyFrame.RW, [
    [
        lazyFrame, Bytes
    ]
]));

TestBody.testWith('LazyFrame.readBody', function t(assert) {
    var frame = v2.LazyFrame.RW.readFrom(new Buffer([
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
    var frame = v2.LazyFrame.RW.readFrom(new Buffer([
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
    v2.LazyFrame.RW.writeInto(frame, buffer, 0);

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

test('CallRequest.RW.lazy', function t(assert) {
    var spanId = Buffer([0x02, 0x04, 0x06, 0x08, 0x0a, 0x0c, 0x0e, 0x10]);
    var parentId = Buffer([0x01, 0x03, 0x05, 0x07, 0x09, 0x0b, 0x0d, 0x0f]);
    var traceId = Buffer([0x01, 0x01, 0x02, 0x03, 0x05, 0x08, 0x0d, 0x15]);
    var tracing = new v2.Tracing(
        spanId, parentId, traceId
    );

    var frame = new v2.Frame(24,    // frame id
        new v2.CallRequest(         // frame body
            42,                     // flags
            99,                     // ttl
            tracing,                // tracing
            "castle",               // service
            {                       // headers
                "cn": "mario",      // headers.cn
                "as": "plumber"     // headers.as
            },                      //
            v2.Checksum.Types.None, // csum
            ["door", "key", "turn"] // args
        )
    );
    var buf = bufrw.toBuffer(v2.Frame.RW, frame);

    var lazyFrame = bufrw.fromBuffer(v2.LazyFrame.RW, buf);

    // validate basic lazy frame properties
    assert.equal(lazyFrame.id, frame.id, 'expected frame id');
    assert.equal(lazyFrame.type, frame.type, 'expected frame type');
    assert.deepEqual(lazyFrame.buffer.parent, buf.parent,
        'frame carries a slice into the original read buffer');

    // validate call req lazy reading
    assertReadRes(
        v2.CallRequest.RW.lazy.readFlags(lazyFrame),
        frame.body.flags,
        'CallRequest.RW.lazy.readFlags');
    assertReadRes(
        v2.CallRequest.RW.lazy.readTTL(lazyFrame),
        frame.body.ttl,
        'CallRequest.RW.lazy.readTTL');
    assertReadRes(
        v2.CallRequest.RW.lazy.readTracing(lazyFrame),
        tracing,
        'CallRequest.RW.lazy.readTracing');
    assertReadRes(
        v2.CallRequest.RW.lazy.readService(lazyFrame),
        frame.body.service,
        'CallRequest.RW.lazy.readService');
    assertReadRes(
        v2.CallRequest.RW.lazy.readArg1(lazyFrame),
        Buffer(frame.body.args[0]),
        'CallRequest.RW.lazy.readArg1');
    assert.equal(
        v2.CallRequest.RW.lazy.isFrameTerminal(lazyFrame),
        !(frame.body.flags & v2.CallFlags.Fragment),
        'CallRequest.RW.lazy.isFrameTerminal');

    // validate call req lazy writing
    var newTTL = frame.body.ttl - 15;
    assert.ifError(
        v2.CallRequest.RW.lazy.writeTTL(newTTL, lazyFrame).err,
        'no error from v2.CallRequest.RW.lazy.writeTTL');
    var newFrame = bufrw.fromBuffer(v2.Frame.RW, lazyFrame.buffer);
    assert.equal(
        newFrame.body.ttl, newTTL,
        'expected new TTL to round trip through eager frame');

    assert.end();

    function assertReadRes(res, value, desc) {
        assert.ifError(res.err, 'no error from ' + desc);
        assert.deepEqual(res.value, value, 'expected value from ' + desc);
    }
});

test('CallResponse.RW.lazy', function t(assert) {
    var spanId = Buffer([0x02, 0x04, 0x06, 0x08, 0x0a, 0x0c, 0x0e, 0x10]);
    var parentId = Buffer([0x01, 0x03, 0x05, 0x07, 0x09, 0x0b, 0x0d, 0x0f]);
    var traceId = Buffer([0x01, 0x01, 0x02, 0x03, 0x05, 0x08, 0x0d, 0x15]);
    var tracing = new v2.Tracing(
        spanId, parentId, traceId
    );

    var frame = new v2.Frame(24,    // frame id
        new v2.CallResponse(        // frame body
            42,                     // flags
            1,                      // code
            tracing,                // tracing
            {                       // headers
                "as": "plumber"     // headers.as
            },                      //
            v2.Checksum.Types.None, // csum
            ["", "creak", "open"]   // args
        )
    );
    var buf = bufrw.toBuffer(v2.Frame.RW, frame);

    var lazyFrame = bufrw.fromBuffer(v2.LazyFrame.RW, buf);

    // validate basic lazy frame properties
    assert.equal(lazyFrame.id, frame.id, 'expected frame id');
    assert.equal(lazyFrame.type, frame.type, 'expected frame type');
    assert.deepEqual(lazyFrame.buffer.parent, buf.parent,
        'frame carries a slice into the original read buffer');

    // validate call res lazy reading
    assertReadRes(
        v2.CallResponse.RW.lazy.readFlags(lazyFrame),
        frame.body.flags,
        'CallResponse.RW.lazy.readFlags');
    assertReadRes(
        v2.CallResponse.RW.lazy.readTracing(lazyFrame),
        tracing,
        'CallResponse.RW.lazy.readTracing');
    assert.equal(
        v2.CallResponse.RW.lazy.isFrameTerminal(lazyFrame),
        !(frame.body.flags & v2.CallFlags.Fragment),
        'CallResponse.RW.lazy.isFrameTerminal');

    assert.end();

    function assertReadRes(res, value, desc) {
        assert.ifError(res.err, 'no error from ' + desc);
        assert.deepEqual(res.value, value, 'expected value from ' + desc);
    }
});
