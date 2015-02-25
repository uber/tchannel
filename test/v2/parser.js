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

var Parser = require('../../v2/parser.js');
var TestFrame = require('./test_frame');
var parserTest = require('../lib/parser_test');

var buffers = [
    Buffer([0x06, 0x04, 0x62, 0x6f, 0x6f, 0x74]),       // boot
    Buffer([0x05, 0x03, 0x63, 0x61, 0x74]),             // cat
    Buffer([0x07, 0x05, 0x62, 0x6f, 0x6f, 0x74, 0x73]), // boots
    Buffer([0x06, 0x04, 0x63, 0x61, 0x74, 0x73]),       // cats
    Buffer([0x07, 0x05, 0x62, 0x6f, 0x6f, 0x74, 0x73]), // boots
    Buffer([0x03, 0x01, 0x4e]),                         // N
    Buffer([0x06, 0x04, 0x63, 0x61, 0x74, 0x73]),       // cats
    Buffer([0x03, 0x01, 0x4e]),                         // N
    Buffer([0x07, 0x05, 0x62, 0x6f, 0x6f, 0x74, 0x73]), // boots
    Buffer([0x03, 0x01, 0x4e]),                         // N
    Buffer([0x06, 0x04, 0x63, 0x61, 0x74, 0x73])        // cats
];

var expectedFrames = [
    {frame: expectPayload('boot')},
    {frame: expectPayload('cat')},
    {frame: expectPayload('boots')},
    {frame: expectPayload('cats')},
    {frame: expectPayload('boots')},
    {frame: expectPayload('N')},
    {frame: expectPayload('cats')},
    {frame: expectPayload('N')},
    {frame: expectPayload('boots')},
    {frame: expectPayload('N')},
    {frame: expectPayload('cats')}
];

var BigChunk = Buffer.concat(buffers);

var oneBytePer = new Array(BigChunk.length);
for (var i = 0; i < BigChunk.length; i++) {
    oneBytePer.push(Buffer([BigChunk[i]]));
}

parserTest('works frame-at-a-time', makeV2Parser, buffers, expectedFrames);
parserTest('works from one big chunk', makeV2Parser, [BigChunk], expectedFrames);
parserTest('works byte-at-a-time', makeV2Parser, oneBytePer, expectedFrames);

function makeV2Parser() {
    return Parser(TestFrame, {
        frameLengthSize: 1
    });
}

function expectPayload(str) {
    return function payloadExpected(frame, assert) {
        assert.equal(String(frame.payload), str, 'got expected payload');
    };
}
