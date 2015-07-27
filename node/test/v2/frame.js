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

var testRW = require('bufrw/test_rw');
var Frame = require('../../v2/frame.js');
var TestBody = require('./lib/test_body.js');

TestBody.testWith('Frame.RW: read/write payload', testRW.cases(Frame.RW, [

    [
        new Frame(0x01020304, TestBody(Buffer('doge'))), [
            0x00, 0x15,             // size:2:
            TestBody.TypeCode,      // type:1
            0x00,                   // reserved:1
            0x01, 0x02, 0x03, 0x04, // id:4
            0x00, 0x00, 0x00, 0x00, // reserved:4
            0x00, 0x00, 0x00, 0x00, // reserved:4

            0x04, 0x64, 0x6f, 0x67, 0x65 // payload~1
        ]
    ],

    [
        new Frame(0x01020304, TestBody(Buffer('cat'))),[
            0x00, 0x14,             // size:2:
            TestBody.TypeCode,      // type:1
            0x00,                   // reserved:1
            0x01, 0x02, 0x03, 0x04, // id:4
            0x00, 0x00, 0x00, 0x00, // reserved:4
            0x00, 0x00, 0x00, 0x00, // reserved:4
            0x03, 0x63, 0x61, 0x74  // payload~1
        ]
    ]

]));
