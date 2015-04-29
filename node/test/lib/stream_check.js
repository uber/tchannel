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

var util = require('util');

var base2 = require('./base2');

module.exports = StreamCheck;

function StreamCheck(name, assert, expected) {
    var self = this;
    self.name = name;
    self.assert = assert;
    self.expected = expected;
}

StreamCheck.prototype.verifyChunk = function verifyChunk(offset, gotChunk) {
    var self = this;
    var expectedChunk = self.expected.read(gotChunk.length) || Buffer(0);
    self.assert.deepEqual(gotChunk, expectedChunk, util.format(
        self.name + ': expected chunk %s bytes @%s',
        base2.pretty(gotChunk.length, 'B'),
        '0x' + offset.toString(16))
    );
    return offset + gotChunk.length;
};

StreamCheck.prototype.verifyDrained = function verifyDrained() {
    var self = this;
    var remain = self.expected.read();
    self.assert.equal(remain, null, self.name + ': got all expected data (bytes)');
    self.assert.equal(remain && remain.length || 0, 0, self.name + ': got all expected data (length)');
};

StreamCheck.prototype.verifyStream = function verifyStream(got) {
    var self = this;
    return function verifyStreamThunk(callback) {
        var offset = 0;
        got.on('data', onData);
        got.on('error', streamDone);
        got.on('end', streamDone);
        function onData(gotChunk) {
            offset = self.verifyChunk(offset, gotChunk);
        }
        function streamDone(err) {
            self.assert.ifError(err, self.name + ': no error');
            if (!err) self.verifyDrained();
            callback();
        }
    };
};
