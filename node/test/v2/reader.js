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

var util = require('util');
var Reader = require('../../v2/reader.js');
var TestFrame = require('./test_frame');
var testExpectations = require('../lib/test_expectations');
var PassThrough = require('stream').PassThrough;

var buffers = [];
var expectedFrames = [];
[
    'boot', 'cat',
    'boots', 'cats',
    'boots', 'N',
    'cats', 'N',
    'boots', 'N',
    'cats'
].forEach(function eachToken(token, i) {
    var assertMess = util.format('got expected[%s] payload token %j', i, token);
    buffers.push(TestFrame(token).toBuffer());
    expectedFrames.push({
        frame: function expectToken(frame, assert) {
            assert.equal(String(frame.payload), token, assertMess);
        }
    });

});

var BigChunk = Buffer.concat(buffers);

var oneBytePer = new Array(BigChunk.length);
for (var i = 0; i < BigChunk.length; i++) {
    oneBytePer.push(Buffer([BigChunk[i]]));
}

readerTest('works frame-at-a-time', buffers, expectedFrames);
readerTest('works from one big chunk', [BigChunk], expectedFrames);
readerTest('works byte-at-a-time', oneBytePer, expectedFrames);

function readerTest(desc, chunks, expected) {
    testExpectations(desc, expected, function run(expect, done) {
        var reader = Reader(TestFrame, {
            frameLengthSize: 1
        });
        var stream = PassThrough({
            highWaterMark: 1
        });
        chunks.forEach(function(chunk) {
            stream.push(chunk);
        });
        stream.push(null);
        reader.on('data', function onData(frame) {
            expect('frame', frame);
        });
        reader.on('error', function onError(err) {
            expect('error', err);
        });
        reader.on('end', done);
        stream.pipe(reader);
    });
}
