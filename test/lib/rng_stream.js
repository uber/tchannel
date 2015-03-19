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

var inherits = require('util').inherits;
var Readable = require('stream').Readable;

function LCGStream(options) {
    if (!(this instanceof LCGStream)) {
        return new LCGStream(options);
    }
    var self = this;
    Readable.call(self);
    self._limit = options.limit || Math.pow(2, 16); // enough for anyone
    self._cur = 0;
    // linear congruential generator w/ lol settings
    self._rng = {
        last: options.seed || Math.floor(Math.pow(2, 32) * Math.random()),
        m: Math.pow(2, 32),
        a: 214013,
        c: 253101
    };

}
inherits(LCGStream, Readable);

LCGStream.prototype._read = function _read(size) {
    var self = this;
    var remain = Math.max(0, self._limit - self._cur);
    size = Math.min(remain, size);
    if (!size) {
        self.push(null);
        return;
    }
    var count = Math.floor(size / 4);
    var buf = new Buffer(4 * count);
    for (var i = 0, o = 0; i < count; i++, o += 4) {
        var n = (self._rng.a * self._rng.last + self._rng.c) % self._rng.m;
        self._rng.last = n;
        buf.writeUInt32BE(n, o);
    }
    self.push(buf);
    self._cur += buf.length;
};

module.exports = LCGStream;

if (module === require.main) {
    var hex = require('hexer');
    var s = LCGStream({limit: Math.pow(2, 20)});
    s.pipe(hex.Transform({cols: 32})).pipe(process.stdout);
}
