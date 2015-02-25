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

var read = require('../../lib/read.js');
var write = require('../../lib/write.js');

module.exports = TestFrame;

function TestFrame(size, payload) {
    var self = this;
    self.size = size || 1 + 1 + self.payload.length;
    self.payload = payload;
}

TestFrame.read = read.chained(read.series([
    read.UInt8,
    read.buf1
]), function(results, buffer, offset) {
    var size = results[0];
    var payload = results[1];
    var body = new TestFrame(size, payload);
    return [null, offset, body];
});

TestFrame.prototype.write = function writeTestBody() {
    var self = this;
    return write.buf1(self.payload);
};
