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
var testRW = require('bufrw/test_rw');
var Call = require('../../v2/call.js');
var Checksum = require('../../v2/checksum.js');
var Tracing = require('../../v2/tracing.js');

var testTracing = new Tracing(
    new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
    new Buffer([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]),
    new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]),
    24
);

var testReq = new Call.Request(
    0, 1024, testTracing, 'apache', {key: 'val'},
    Checksum.Types.Farm32,
    [Buffer('on'), Buffer('to'), Buffer('te')]
);

var testReqBytes = [
    0x00,                   // flags:1
    0x00, 0x00, 0x04, 0x00, // ttl:4
    0x00, 0x01, 0x02, 0x03, // tracing:24
    0x04, 0x05, 0x06, 0x07, // ...
    0x08, 0x09, 0x0a, 0x0b, // ...
    0x0c, 0x0d, 0x0e, 0x0f, // ...
    0x10, 0x11, 0x12, 0x13, // ...
    0x14, 0x15, 0x16, 0x17, // ...
    0x18,                   // traceflags:1
    0x06,                   // service~1
    0x61, 0x70, 0x61, 0x63, // ...
    0x68, 0x65,             // ...
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // (hk~1 hv~1){nh}
    0x03, 0x76, 0x61, 0x6c, // ...
    Checksum.Types.Farm32,  // csumtype:1
    0x8e, 0x09, 0xa1, 0xbd, // (csum:4){0,1}
    0x00, 0x02, 0x6f, 0x6e, // arg1~2
    0x00, 0x02, 0x74, 0x6f, // arg2~2
    0x00, 0x02, 0x74, 0x65  // arg3~2
];

test('Call.Request.RW: read/write payload', testRW.cases(Call.Request.RW, [
    {
        lengthTest: {
            length: testReqBytes.length,
            value: testReq
        },
        writeTest: {
            bytes: testReqBytes,
            value: testReq
        },
        readTest: {
            bytes: testReqBytes,
            value: testReq
        }
    }
]));

var testRes = new Call.Response(
    0, Call.Response.Codes.OK, testTracing, {key: 'val'},
    Checksum.Types.Farm32,
    [Buffer('ON'), Buffer('TO'), Buffer('TE')]
);

var testResBytes = [
    0x00,                   // flags:1
    Call.Response.Codes.OK, // code:1
    0x00, 0x01, 0x02, 0x03, // tracing:24
    0x04, 0x05, 0x06, 0x07, // ...
    0x08, 0x09, 0x0a, 0x0b, // ...
    0x0c, 0x0d, 0x0e, 0x0f, // ...
    0x10, 0x11, 0x12, 0x13, // ...
    0x14, 0x15, 0x16, 0x17, // ...
    0x18,                   // traceflags:1
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // (hk~1 hv~1){nh}
    0x03, 0x76, 0x61, 0x6c, // ...
    Checksum.Types.Farm32,  // csumtype:1
    0x8d, 0x82, 0xe8, 0xba, // (csum:4){0,1}
    0x00, 0x02, 0x4f, 0x4e, // arg1~2
    0x00, 0x02, 0x54, 0x4f, // arg2~2
    0x00, 0x02, 0x54, 0x45  // arg3~2
];

test('Call.Response.RW: read/write payload', testRW.cases(Call.Response.RW, [
    {
        lengthTest: {
            length: testResBytes.length,
            value: testRes
        },
        writeTest: {
            bytes: testResBytes,
            value: testRes
        },
        readTest: {
            bytes: testResBytes,
            value: testRes
        }
    }
]));
