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

var TypedError = require('error/typed');

var ShortBufferWriteError = TypedError({
    type: 'tchannel.short-buffer-write',
    message: 'expected to write {expected} bytes, only wrote {actual} instead',
    expected: null,
    actual: null
});

var BufferTooLongError = TypedError({
    type: 'tchannel.buffer-too-long',
    message: '{name} too long, max {max} bytes, given {given} bytes',
    name: 'buffer',
    given: null,
    max: null
});

var ValueOutOfRangeError = TypedError({
    type: 'tchannel.value-out-of-range',
    message: '{name} {value} out of range, max: {max}',
    name: 'value',
    value: null,
    max: null
});

function bufferOrString(arg, desc) {
    if (Buffer.isBuffer(arg)) {
        return arg;
    } else if (typeof arg === 'string') {
        return Buffer(arg);
    } else {
        var mess = 'expected to be a buffer or string';
        if (desc) mess = desc + ' ' + mess;
        throw new Error(mess);
    }
}

module.exports.BufferWriter = BufferWriter;

function BufferWriter(length, writeInto) {
    if (!(this instanceof BufferWriter)) {
        return new BufferWriter(length, writeInto);
    }
    var self = this;
    self.length = length;
    self.writeInto = writeInto;
}

BufferWriter.prototype.create = function create() {
    var self = this;
    var buffer = new Buffer(self.length);
    var offset = self.writeInto(buffer, 0);
    if (offset < buffer.length) {
        throw new ShortBufferWriteError({
            expected: buffer.length,
            actual: offset
        });
    }
    return buffer;
};

module.exports.buf1 = buf1;
module.exports.buf2 = buf2;

function buf1(source, name) { // buf~1
    source = bufferOrString(source, name);
    if (source.length > 0xff) {
        throw BufferTooLongError({
            name: name,
            given: source.length,
            max: 0xff
        });
    }
    return new BufferWriter(1 + source.length, writeSourceBufferInto);
    function writeSourceBufferInto(buffer, offset) {
        // len:1
        buffer.writeUInt8(source.length, offset);
        offset += 1;
        // buf:len
        source.copy(buffer, offset);
        offset += source.length;
        return offset;
    }
}

function buf2(source, name) { // buf~2
    source = bufferOrString(source, name);
    if (source.length > 0xffff) {
        throw BufferTooLongError({
            name: name,
            given: source.length,
            max: 0xffff
        });
    }
    return new BufferWriter(2 + source.length, writeSourceBufferInto);
    function writeSourceBufferInto(buffer, offset) {
        // len:2
        buffer.writeUInt16BE(source.length, offset);
        offset += 2;
        // buf:len
        source.copy(buffer, offset);
        offset += source.length;
        return offset;
    }
}

var pair1 = series([buf1, buf1]);
var pair2 = series([buf2, buf2]);

module.exports.pair1 = pair1;
module.exports.pair2 = pair2;

module.exports.UInt8 = function(val, name) {
    if (typeof val !== 'number') throw new Error(name + ' not a number'); // TODO better type check
    if (val > 0xff) {
        throw ValueOutOfRangeError({
            name: name,
            value: val,
            max: 0xff
        });
    }
    return new BufferWriter(1, function writeUInt8(buffer, offset) {
        buffer.writeUInt8(val, offset);
        return offset + 1;
    });
};

module.exports.UInt16BE = function(val, name) {
    if (typeof val !== 'number') throw new Error(name + ' not a number'); // TODO better type check
    if (val > 0xffff) {
        throw ValueOutOfRangeError({
            name: name,
            value: val,
            max: 0xffff
        });
    }
    return new BufferWriter(2, function writeUInt16BE(buffer, offset) {
        buffer.writeUInt16BE(val, offset);
        return offset + 2;
    });
};

module.exports.UInt32BE = function(val, name) {
    if (typeof val !== 'number') throw new Error(name + ' not a number'); // TODO better type check
    if (val > 0xffffffff) {
        throw ValueOutOfRangeError({
            name: name,
            value: val,
            max: 0xffffffff
        });
    }
    return new BufferWriter(4, function writeUInt32BE(buffer, offset) {
        buffer.writeUInt32BE(val, offset);
        return offset + 4;
    });
};

module.exports.fixed = function(n, source, name) {
    source = bufferOrString(source, name);
    if (source.length > n) {
        throw BufferTooLongError({
            name: name,
            given: source.length,
            max: n
        });
    }
    return new BufferWriter(n, function writeSource(buffer, offset) {
        source.copy(buffer, offset);
        offset += n;
        return offset;
    });
};

module.exports.fill = function(c, n) {
    return new BufferWriter(n, function writeFill(buffer, offset) {
        var end = offset + n;
        buffer.fill(c, offset, end);
        return end;
    });
};

module.exports.series = series;

function series(writers) {
    var length = 0;
    for (var i=0; i<writers.length; i++) {
        length += writers[i].length;
    }
    return BufferWriter(length, function writeSeries(buffer, offset) {
        for (var i=0; i<writers.length; i++) {
            offset = writers[i].writeInto(buffer, offset);
        }
        return offset;
    });
}
