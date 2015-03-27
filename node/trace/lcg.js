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

module.exports = LCG;

function LCG () {
    if (!(this instanceof LCG)) {
        return new LCG();
    }
    var self = this;

    self._rng = {
        last: Math.floor(Math.pow(2, 32) * Math.random()),
        m: Math.pow(2, 32),
        a: 214013,
        c: 253101
    };
}

LCG.prototype.rand = function rand() {
    var self = this;

    var next = (self._rng.a * self._rng.last + self._rng.c) % self._rng.m;
    self._rng.last = next;
    return next;
};

LCG.prototype.rand64 = function rand64() {
    var self = this;

    var ret = new Buffer(8);
    ret.writeUInt32BE(self.rand(), 0);
    ret.writeUInt32BE(self.rand(), 4);
    return ret;
};
