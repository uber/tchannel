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

function IterStream(rw, options) {
    if (!(this instanceof IterStream)) {
        return new IterStream(options);
    }
    if (!rw.width) throw new Error('not an atomic RW');
    var self = this;
    Readable.call(self);
    self._rw = rw;
    self._limit = (
        typeof options.limit !== 'number' ||
        options.limit < 0
    ) ? Math.pow(2, 16) : options.limit;
    self._cur = 0;
}
inherits(IterStream, Readable);

IterStream.prototype._read = function _read(size) {
    var self = this;
    var remain = Math.max(0, self._limit - self._cur);
    size = Math.min(remain, size);
    if (!size) {
        self.push(null);
        return;
    }
    var count = Math.ceil(size / self._rw.width);
    var buf = new Buffer(self._rw.width * count);
    var offset = 0;
    for (var i = 0; i < count; i++) {
        var n = self._next();
        var res = self._rw.writeInto(n, buf, offset);
        if (res.err) {
            if (offset > 0) {
                self.push(buf.slice(0, offset));
                self._cur += offset;
            }
            self.emit('error', res.err);
            self.push(null);
            return;
        }
        offset = res.offset;
    }
    buf = buf.slice(0, size);
    self.push(buf);
    self._cur += buf.length;
};

module.exports = IterStream;
