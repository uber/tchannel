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

var bufrw = require('bufrw');
var inherits = require('util').inherits;
var IterStream = require('./iter_stream');

function CountStream(options) {
    if (!(this instanceof CountStream)) {
        return new CountStream(options);
    }
    var self = this;
    // TODO: allow to change rw
    IterStream.call(self, bufrw.UInt32BE, options);
    self._max = Math.pow(2, 8 * self._rw.width);
    self._n = 0;
}
inherits(CountStream, IterStream);

CountStream.prototype._next = function _read() {
    var self = this;
    var n = self._n;
    self._n = (self._n + 1) % self._max;
    return n;
};

module.exports = CountStream;
