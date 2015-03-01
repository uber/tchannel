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

var inherits = require('util').inherits;
var Transform = require('stream').Transform;

module.exports = ChunkWriter;

function ChunkWriter(options) {
    if (!(this instanceof ChunkWriter)) {
        return new ChunkWriter(options);
    }
    var self = this;
    Transform.call(self, options);
    self._writableState.objectMode = true;
    self._readableState.objectMode = false;
}

inherits(ChunkWriter, Transform);

ChunkWriter.prototype._transform = function _transform(frame, encoding, callback) {
    var self = this;
    var chunk = frame.toBuffer();
    self.push(chunk);
    callback();
};
