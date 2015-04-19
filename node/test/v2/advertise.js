// Copyright (c) 2015 Uber Technologies, Inc.
//
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
var Advertise = require('../../v2/advertise.js');

test('Cont.RequestCont.RW: read/write payload', testRW.cases(Advertise.RW, [

    // zero
    [
        new Advertise({}),
        [ 0x00, 0x00 ]
    ],

    // one
    [
        new Advertise({
            foo: {cost: 0}
        }),
        [ 0x00, 0x01,             // num:2
          0x03, 0x66, 0x6f, 0x6f, // name~1
          0x00                    // cost:1
        ]
    ],

    // two
    [
        new Advertise({
            foo: {cost: 0},
            bar: {cost: 1}
        }),
        [ 0x00, 0x02,             // num:2
          0x03, 0x66, 0x6f, 0x6f, // name~1
          0x00,                   // cost:1
          0x03, 0x62, 0x61, 0x72, // name~1
          0x01                    // cost:1
        ]
    ]

]));
