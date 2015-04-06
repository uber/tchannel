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
var Init = require('../../v2/init.js');
var testRW = require('bufrw/test_rw');

/* jshint camelcase:false */

test('Init.Request.RW: read/write payload', testRW.cases(Init.Request.RW, [
    [
        new Init.Request(2, {
            host_port: '1.2.3.4:5',
            process_name: 'node',
            arbitrary: 'value'
        }), [
            0x00, 0x02,             // version:2
            0x00, 0x03,             // nh:2
            0x00, 0x09, 0x68, 0x6f, // key~2 -- host_port
            0x73, 0x74, 0x5f, 0x70, // ...
            0x6f, 0x72, 0x74,       // ...
            0x00, 0x09, 0x31, 0x2e, // value~2 -- 1.2.3.4:5
            0x32, 0x2e, 0x33, 0x2e, // ...
            0x34, 0x3a, 0x35,       // ...
            0x00, 0x0c, 0x70, 0x72, // key~2 -- process_name
            0x6f, 0x63, 0x65, 0x73, // ...
            0x73, 0x5f, 0x6e, 0x61, // ...
            0x6d, 0x65,             // ...
            0x00, 0x04, 0x6e, 0x6f, // value~2 -- node
            0x64, 0x65,             // ...
            0x00, 0x09, 0x61, 0x72, // key~2 -- arbitrary
            0x62, 0x69, 0x74, 0x72, // ...
            0x61, 0x72, 0x79,       // ...
            0x00, 0x05, 0x76, 0x61, // value~2 -- value
            0x6c, 0x75, 0x65        // ...
        ]
    ]
]));

test('Init.Request.RW: read/write payload', testRW.cases(Init.Response.RW, [
    [
        new Init.Response(2, {
            host_port: '2.3.4.5:6',
            process_name: 'NODE',
            arbitrary: 'VALUE'
        }), [
            0x00, 0x02,             // version:2
            0x00, 0x03,             // nh:2
            0x00, 0x09, 0x68, 0x6f, // key~2 -- host_port
            0x73, 0x74, 0x5f, 0x70, // ...
            0x6f, 0x72, 0x74,       // ...
            0x00, 0x09, 0x32, 0x2e, // value~2 -- 2.3.4.5:6
            0x33, 0x2e, 0x34, 0x2e, // ...
            0x35, 0x3a, 0x36,       // ...
            0x00, 0x0c, 0x70, 0x72, // key~2 -- process_name
            0x6f, 0x63, 0x65, 0x73, // ...
            0x73, 0x5f, 0x6e, 0x61, // ...
            0x6d, 0x65,             // ...
            0x00, 0x04, 0x4e, 0x4f, // value~2 -- node
            0x44, 0x45,             // ...
            0x00, 0x09, 0x61, 0x72, // key~2 -- arbitrary
            0x62, 0x69, 0x74, 0x72, // ...
            0x61, 0x72, 0x79,       // ...
            0x00, 0x05, 0x56, 0x41, // value~2 -- value
            0x4c, 0x55, 0x45        // ...
        ]
    ]
]));
