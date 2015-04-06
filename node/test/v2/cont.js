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
var Cont = require('../../v2/cont.js');
var Checksum = require('../../v2/checksum.js');

var testReqCont = new Cont.RequestCont(
    0, Checksum.Types.Farm32,
    [Buffer('on'), Buffer('to'), Buffer('te')]
);

var testReqContBytes = [
    0x00,                   // flags:1
    Checksum.Types.Farm32,  // csumtype:1
    0x8e, 0x09, 0xa1, 0xbd, // (csum:4){0,1}
    0x00, 0x02, 0x6f, 0x6e, // arg1~2
    0x00, 0x02, 0x74, 0x6f, // arg2~2
    0x00, 0x02, 0x74, 0x65  // arg3~2
];

test('Cont.RequestCont.RW: read/write payload', testRW.cases(Cont.RequestCont.RW, [
    {
        lengthTest: {
            length: testReqContBytes.length,
            value: testReqCont
        },
        writeTest: {
            bytes: testReqContBytes,
            value: testReqCont
        },
        readTest: {
            bytes: testReqContBytes,
            value: testReqCont
        }
    }
]));

var testResCont = new Cont.ResponseCont(
    0, Checksum.Types.Farm32,
    [Buffer('ON'), Buffer('TO'), Buffer('TE')]
);

var testResContBytes = [
    0x00,                   // flags:1
    Checksum.Types.Farm32,  // csumtype:1
    0x8d, 0x82, 0xe8, 0xba, // (csum:4){0,1}
    0x00, 0x02, 0x4f, 0x4e, // arg1~2
    0x00, 0x02, 0x54, 0x4f, // arg2~2
    0x00, 0x02, 0x54, 0x45  // arg3~2
];

test('Cont.ResponseCont.RW: read/write payload', testRW.cases(Cont.ResponseCont.RW, [
    {
        lengthTest: {
            length: testResContBytes.length,
            value: testResCont
        },
        writeTest: {
            bytes: testResContBytes,
            value: testResCont
        },
        readTest: {
            bytes: testResContBytes,
            value: testResCont
        }
    }
]));
