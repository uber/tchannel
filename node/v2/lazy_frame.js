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
var errors = require('../errors');

var Frame = require('./frame.js');

module.exports = LazyFrame;

function LazyFrame() {
    var self = this;
    self.isLazy = true;
    self.size = Frame.Overhead;
    self.type = 0;
    self.id = Frame.NullId;
    self.body = null;
    self.bodyRW = null;
    self.buffer = null;
}

// size:2 type:1 reserved:1 id:4 reserved:8 ...
LazyFrame.RW = bufrw.Base(lazyFrameLength, readLazyFrameFrom, writeLazyFrameInto);

LazyFrame.TypeOffset = 2;
LazyFrame.IdOffset = 2 + 1 + 1;

LazyFrame.prototype.readBody = function readBody() {
    var self = this;
    if (self.body) {
        return bufrw.ReadResult.just(self.body);
    }

    if (!self.buffer) {
        // TODO: typed error
        return bufrw.ReadResult.error(new Error('no buffer to read from'));
    }

    var res = self.bodyRW.readFrom(self.buffer, Frame.Overhead);
    if (!res.err) {
        self.body = res.value;
    }

    return res;
};

function lazyFrameLength(lazyFrame) {
    return bufrw.LengthResult.just(lazyFrame.size);
}

function readLazyFrameFrom(buffer, offset) {
    var start = offset;
    var lazyFrame = new LazyFrame();

    // size:2:
    lazyFrame.size = buffer.readUInt16BE(offset);
    offset += lazyFrame.size;
    lazyFrame.buffer = buffer.slice(start, offset);

    // type:1
    lazyFrame.type = lazyFrame.buffer.readUInt8(LazyFrame.TypeOffset);
    lazyFrame.bodyRW = Frame.Types[lazyFrame.type].RW;
    if (!lazyFrame.bodyRW) {
        return bufrw.ReadResult.error(errors.InvalidFrameTypeError({
            typeNumber: lazyFrame.type
        }), offset + LazyFrame.TypeOffset);
    }

    // id:4
    lazyFrame.id = lazyFrame.buffer.readUInt32BE(LazyFrame.IdOffset);

    return bufrw.ReadResult.just(offset, lazyFrame);
}

function writeLazyFrameInto(lazyFrame, buffer, offset) {
    if (!lazyFrame.buffer) {
        // TODO: typed error
        return bufrw.WriteResult.error(new Error('unimplemented degenerate lazyFrame write'));
    }

    var remain = buffer.length - offset;
    if (lazyFrame.size > remain) {
        return bufrw.WriteResult.shortError(lazyFrame.size, remain, offset);
    }

    offset += lazyFrame.buffer.copy(buffer, offset, 0, lazyFrame.size);
    return bufrw.WriteResult.just(offset);
}
