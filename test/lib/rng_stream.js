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

function LCGStream(options) {
    if (!(this instanceof LCGStream)) {
        return new LCGStream(options);
    }
    var self = this;
    IterStream.call(self, bufrw.UInt32BE, options);

    // linear congruential generator w/ lol settings
    self._last = options.seed || Math.floor(Math.pow(2, 32) * Math.random());
    self._mod = Math.pow(2, 32);
    self._mul = 214013;
    self._add = 253101;
}
inherits(LCGStream, IterStream);

LCGStream.prototype._next = function _next() {
    var self = this;
    self._last = (self._mul * self._last + self._add) % self._mod;
    return self._last;
};

module.exports = LCGStream;
