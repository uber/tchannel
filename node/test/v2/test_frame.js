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

var bufrw = require('bufrw');

module.exports = TestFrame;

function TestFrame(payload) {
    if (!(this instanceof TestFrame)) {
        return new TestFrame(payload);
    }
    var self = this;
    self.size = 0;
    self.payload = payload;
}

// size:1 payload~1
TestFrame.struct = bufrw.Struct(TestFrame, [
    {call: {
        byteLength: function byteLength(frame) {
            var res = bufrw.buf1.byteLength(frame.payload);
            if (res.err) return res;
            frame.size = 1 + res.length;
            return bufrw.LengthResult.just(0);
        }
    }},
    {name: 'size', rw: bufrw.UInt8},  // size:1
    {name: 'payload', rw: bufrw.buf1} // payload~1
]);

TestFrame.prototype.toBuffer = function toBuffer() {
    var self = this;
    return bufrw.toBuffer(TestFrame.struct, self);
};
