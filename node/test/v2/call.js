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

var extend = require('xtend');
var CountStream = require('./test/lib/count_stream');
var TestIsolateSearch = require('./test/lib/test_isolate_search');

test('fragementation', function t(assert) {
    var maxSize = 0x40;
    var reqOverhead = 0x22;
    var reqContOverhead = 0x02;

    TestIsolateSearch({
        init: init,
        explore: explore,
        isolate: isolate,
        test: test,
        sizeLimit: maxSize * 4,
        basis: [0, 1, 2]
    }).run(assert);

    function test(state, assert) {
        var arg1 = CountStream({limit: state.arg1}).read();
        var arg2 = CountStream({limit: state.arg2}).read();
        var arg3 = CountStream({limit: state.arg3}).read();

        var body = Call.Request(0, 0, testTracing, '', {}, Checksum.Types.None);
        var bodies = body.splitArgs([arg1, arg2, arg3], maxSize);

        // reqOverhead
        // reqContOverhead

        assert.end();
    }

    function init() {
        var self = this;
        self.expand(function(emit) {
            self.options.basis.forEach(function(n) {
                emit(self.makeSpec({arg1: n, arg2: 0, arg3: 0}));
                // emit(self.makeSpec({arg1: n, arg2: 0, arg3: 0}));
                // emit(self.makeSpec({arg1: n, arg2: 0, arg3: 0}));
            });
        });
    }

    function explore(spec, emit) {
        var self = this;
        var state = spec.test
        var sizeLimit = self.options.sizeLimit;
        self.options.basis.forEach(function(n) {
            if (n * state.arg1 < sizeLimit) emit(extend(state, {arg1: n * state.arg1}));
            // if (n * state.arg2 < sizeLimit) emit(extend(state, {arg2: n * state.arg2}));
            // if (n * state.arg3 < sizeLimit) emit(extend(state, {arg3: n * state.arg3}));
        });
    }

    function isolate(spec, emit) {
        var good = spec.good;
        var bad = spec.bad;
        if (bad.arg1 - good.arg1 > 1) extend(good, {arg1: mid(good.arg1, bad.arg1)});
        // if (bad.arg2 - good.arg2 > 1) extend(good, {arg2: mid(good.arg2, bad.arg2)});
        // if (bad.arg3 - good.arg3 > 1) extend(good, {arg3: mid(good.arg3, bad.arg3)});
    }

});

function mid(a, b) {
    return a + b/2 - a/2;
}
