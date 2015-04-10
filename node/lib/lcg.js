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

function LCG (seed) {
    var self = this;
    if (typeof seed === 'number') {
        self.last = seed;
    } else {
        self.last = Math.floor(Math.pow(2, 32) * Math.random());
    }
    self.mod = Math.pow(2, 32);
    self.mul = 214013;
    self.add = 253101;
}

LCG.prototype.rand = function rand() {
    var self = this;
    self.last = (self.mul * self.last + self.add) % self.mod;
    return self.last;
};

LCG.prototype.rand64 = function rand64() {
    var self = this;
    var ret = new Buffer(8);
    ret.writeUInt32BE(self.rand(), 0);
    ret.writeUInt32BE(self.rand(), 4);
    return ret;
};

module.exports = LCG;
