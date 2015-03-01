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
var Writer = require('../../v2/writer.js');
var TestFrame = require('./test_frame');
var testExpectations = require('../lib/test_expectations');
var PassThrough = require('stream').PassThrough;

var frames = [];
var expectedBuffers = [];
[
    'boot', 'cat',
    'boots', 'cats',
    'boots', 'N',
    'cats', 'N',
    'boots', 'N',
    'cats'
].forEach(function eachToken(token, i) {
    var assertMess = util.format('got expected[%s] buffer', i);
    var frame = TestFrame(token);
    var expectedBuffer = frame.toBuffer();
    frames.push(frame);
    expectedBuffers.push({
        buffer: function expectToken(buffer, assert) {
            assert.deepEqual(buffer, expectedBuffer, assertMess);
        }
    });
});

testExpectations('writes expected frame buffers', expectedBuffers, function run(expect, done) {
    var writer = Writer();
    var stream = PassThrough({
        objectMode: true
    });
    frames.forEach(function(frame) {
        stream.push(frame);
    });
    stream.push(null);
    writer.on('data', function onData(buffer) {
        expect('buffer', buffer);
    });
    writer.on('error', function onError(err) {
        expect('error', err);
    });
    writer.on('end', done);
    stream.pipe(writer);
});
