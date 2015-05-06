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
var Cancel = require('../../v2/cancel.js');
var testRW = require('bufrw/test_rw');
var Tracing = require('../../v2/tracing.js');

var testTracing = new Tracing(
    new Buffer([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
    new Buffer([0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]),
    new Buffer([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17]),
    24
);

test('Cancel.RW: read/write payload', testRW.cases(Cancel.RW, [

    // simple example payload
    [
        new Cancel(42, testTracing, 'too bad.'), [
            0x00, 0x00, 0x00, 0x2a, // ttl:4
            0x00, 0x01, 0x02, 0x03, // tracing:24
            0x04, 0x05, 0x06, 0x07, // ...
            0x08, 0x09, 0x0a, 0x0b, // ...
            0x0c, 0x0d, 0x0e, 0x0f, // ...
            0x10, 0x11, 0x12, 0x13, // ...
            0x14, 0x15, 0x16, 0x17, // ...
            0x18,                   // traceflags:1
            0x00, 0x08, 0x74, 0x6f, // why~2
            0x6f, 0x20, 0x62, 0x61, // ...
            0x64, 0x2e              // ...
        ]
    ]

]));
