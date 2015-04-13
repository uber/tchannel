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
var HeaderRW = require('../../v2/header.js');
var testRW = require('bufrw/test_rw');

test('HeaderRW: read/write header1', testRW.cases(HeaderRW.header1, [

    // read empty
    [{}, [0x00]],

    // read 1 k-v pair
    [{key: 'val'}, [
        0x01,                   // nh:1
        0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
        0x03, 0x76, 0x61, 0x6c  // hv~1 "val"
    ]],

    // read 3 k-v pairs
    [{
        red: 'green',
        blue: 'yellow',
        magenta: 'cyan'
    }, [
        0x03,                   // nh:1
        0x03, 0x72, 0x65, 0x64, // hk~1 "red"
        0x05, 0x67, 0x72, 0x65, // hv~1 "green"
        0x65, 0x6e,             // ...
        0x04, 0x62, 0x6c, 0x75, // hk~1 "blue"
        0x65,                   // ...
        0x06, 0x79, 0x65, 0x6c, // hv~1 "yellow"
        0x6c, 0x6f, 0x77,       // ...
        0x07, 0x6d, 0x61, 0x67, // hk~1 "magenta"
        0x65, 0x6e, 0x74, 0x61, // ...
        0x04, 0x63, 0x79, 0x61, // hv~1 "cyan"
        0x6e                    // ...
    ]],

    // read duplicate header key -> error
    {
        readTest: {
            bytes: [
                0x02,                   // nh:1
                0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
                0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
                0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
                0x03, 0x56, 0x41, 0x4c  // hv~1 "VAL"
            ],
            error: {
                name: 'TchannelDuplicateHeaderKeyError',
                type: 'tchannel.duplicate-header-key',
                message: 'duplicate header key key',
                key: 'key',
                priorValue: 'val',
                value: 'VAL',
                offset: 9,
                endOffset: 17
            }
        }
    },

    // read null key -> error
    {
        readTest: {
            bytes: [
                0x01,             // nh:1
                0x00,             // hk~1 ""
                0x02, 0x65, 0x6b, // hv~1 "ek"
            ],
            error: {
                type: 'tchannel.null-key',
                name: 'TchannelNullKeyError',
                message: 'null key',
                offset: 1,
                endOffset: 2
            }
        }
    },

    // read null value -> ok
    {
        readTest: {
            bytes: [
                0x01,             // nh:1
                0x02, 0x65, 0x76, // hk~1 "ev"
                0x00              // hv~1 ""
            ],
            value: {ev: ''}
        }
    },

    // read error: extra k-v pair
    {
        readTest: {
            bytes: [
                0x01,                   // nh:1
                0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
                0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
                0x03, 0x63, 0x61, 0x74, // hk~1 "cat"
                0x03, 0x64, 0x6f, 0x67  // hv~1 "dog"
            ],
            error: {
                name: 'BufrwShortReadError',
                type: 'bufrw.short-read',
                message: 'short read, 8 byte left over after consuming 9',
                offset: 9,
                remaining: 8
            }
        }
    },

    // read error: missing k-v pair
    {
        readTest: {
            bytes: [
                0x03,                   // nh:1
                0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
                0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
                0x03, 0x63, 0x61, 0x74, // hk~1 "cat"
                0x03, 0x64, 0x6f, 0x67  // hv~1 "dog"
            ],
            error: {
                name: 'BufrwShortBufferError',
                type: 'bufrw.short-buffer',
                message: 'expected at least 1 bytes, only have 0 @17',
                offset: 17,
                actual: 0,
                expected: 1
            }
        }
    }

]));
