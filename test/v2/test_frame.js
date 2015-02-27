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

var TypedError = require("error/typed");
var read = require('../../lib/read.js');
var write = require('../../lib/write.js');

var SizeMismatchError = TypedError({
    type: 'test-frame.size-mismatch',
    message: 'size ({size}) mismatches buffer length ({bufferLength})',
    size: null,
    bufferLength: null
});

module.exports = TestFrame;

// size:1 payload~1

function TestFrame(payload) {
    if (!(this instanceof TestFrame)) {
        return new TestFrame(payload);
    }
    var self = this;
    self.payload = payload;
}

TestFrame.read = read.chained(read.series([
    read.UInt8, // size:1
    read.buf1   // payload~1
]), function(results, buffer, offset) {
    var size = results[0];
    var payload = results[1];
    if (size !== buffer.length) {
        // parser shouldn't let this happen
        return [SizeMismatchError({
            size: null,
            bufferLength: null
        }), offset, null];
    }
    var body = new TestFrame(payload);
    return [null, offset, body];
});

TestFrame.prototype.write = function writeTestBody() {
    var self = this;
    var payload = write.buf1(self.payload);
    var size = write.UInt8(1 + payload.length);
    return write.series([
        size,   // size:1
        payload // payload~1
    ]);
};

TestFrame.prototype.toBuffer = function toBuffer() {
    var self = this;
    return self.write().create();
};
