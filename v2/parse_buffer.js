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

module.exports = ParseBuffer;

function ParseBuffer() {
    var self = this;
    self.buffer = Buffer(0);
}

ParseBuffer.prototype.avail = function avail() {
    var self = this;
    return self.buffer.length;
};

ParseBuffer.prototype.free = function free() {
    return 0;
};

ParseBuffer.prototype.clear = function clear() {
    var self = this;
    self.buffer = Buffer(0);
};

ParseBuffer.prototype.push = function push(chunk) {
    var self = this;
    if (self.buffer.length) {
        self.buffer = Buffer.concat([self.buffer, chunk], self.buffer.length + chunk.length);
    } else {
        self.buffer = chunk;
    }
};

ParseBuffer.prototype.shift = function shift(n) {
    var self = this;
    var chunk;
    if (self.buffer.length < n) {
        chunk = Buffer(0);
    } else if (self.buffer.length > n) {
        chunk = self.buffer.slice(0, n);
        self.buffer = self.buffer.slice(n);
    } else {
        chunk = self.buffer;
        self.buffer = Buffer(0);
    }
    return chunk;
};

ParseBuffer.prototype.readUInt8 = function readUInt8(offset) {
    var self = this;
    return self.buffer.readUInt8(offset);
};

ParseBuffer.prototype.readUInt16BE = function readUInt16BE(offset) {
    var self = this;
    return self.buffer.readUInt16BE(offset);
};

ParseBuffer.prototype.readUInt32BE = function readUInt32BE(offset) {
    var self = this;
    return self.buffer.readUInt32BE(offset);
};

// TODO: split out and complete buffer api
