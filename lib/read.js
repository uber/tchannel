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

/* jshint maxparams:5 */

var TypedError = require('error/typed');
var ShortBufferError = TypedError({
    type: 'tchannel.short-buffer',
    message: 'buffer smaller than {expected} bytes, got {actual}',
    expected: null,
    actual: null
});

module.exports.valspy = valspy;

function valspy(name, func) {
    return function(inval, buffer, offset) {
        var res = func(inval, buffer, offset);
        var err = res[0];
        var newOffset = res[1];
        var outval = res[2];
        console.error(name, {inval: inval, outval: outval, err: err, offset: offset, newOffset: newOffset});
        return res;
    };
}

module.exports.spy = spy;

function spy(name, func) {
    return function(buffer, offset) {
        var res = func(buffer, offset);
        var err = res[0];
        var newOffset = res[1];
        var outval = res[2];
        console.error(name, {outval: outval, err: err, offset: offset, newOffset: newOffset});
        return res;
    };
}

module.exports.want = want;

function want(n, buffer, offset) {
    var remain = buffer.length - offset;
    if (remain < n) {
        return ShortBufferError({
            expected: n,
            actual: remain
        });
    } else {
        return null;
    }
}

module.exports.readWidth = readWidth;

function readWidth(n, func) {
    return function widthReader(buffer, offset) {
        var err = want(n, buffer, offset);
        if (err) return [err, offset, null];
        var val = func(buffer, offset);
        offset += n;
        return [null, offset, val];
    };
}

var UInt8 = module.exports.UInt8 = readWidth(1, function UInt8(buffer, offset) {
    return buffer.readUInt8(offset);
});

var UInt16BE = module.exports.UInt16BE = readWidth(2, function UInt16BE(buffer, offset) {
    return buffer.readUInt16BE(offset);
});

module.exports.UInt32BE = readWidth(4, function UInt32BE(buffer, offset) {
    return buffer.readUInt32BE(offset);
});

module.exports.skip = skip;

function skip(n) {
    return function readSkip(buffer, offset) {
        return [null, offset + n, null];
    };
}

module.exports.fixed = fixed;
module.exports.len = len;

function fixed(n) {
    return function readFixed(buffer, offset) {
        return len(n, buffer, offset);
    };
}

function len(n, buffer, offset) {
    var end = offset + n;
    if (end > buffer.length) {
        return [ShortBufferError({
            expected: n,
            actual: buffer.length - offset
        }), offset, null];
    } else {
        return [null, offset + n, buffer.slice(offset, end)];
    }
}

module.exports.chain = chain;
module.exports.chained = chained;

function chain(reader, buffer, offset, func) {
    /* jshint validthis:true */
    var res = reader(buffer, offset);
    if (res[0]) return res;
    offset = res[1];
    var val = res[2];
    return func.call(this, val, buffer, offset);
}

function chained(reader, func) {
    return function chainedReader(buffer, offset) {
        return chain.call(this, reader, buffer, offset, func);
    };
}

var buf1 = chained(UInt8, len); // buf~1
var buf2 = chained(UInt16BE, len); // buf~2

function series(readers) {
    return function(buffer, offset) {
        var results = new Array(readers.length);
        for (var i=0; i<readers.length; i++) {
            var reader = readers[i];
            var res = reader(buffer, offset);
            var err = res[0];
            if (err) return res;
            offset = res[1];
            results[i] = res[2];
        }
        return [null, offset, results];
    };
}

var pair1 = series([buf1, buf1]); // a~1 b~1
var pair2 = series([buf2, buf2]); // a~2 b~2

module.exports.buf1 = buf1;
module.exports.buf2 = buf2;

module.exports.series = series;

module.exports.pair1 = pair1;
module.exports.pair2 = pair2;

module.exports.reduced = reduced;
module.exports.reduce = reduce;

function reduce(reader, reducer, state, buffer, start) {
    var offset = start;
    while (!state.done) {
        var res = reader(buffer, offset);
        var err = res[0];
        offset = res[1];
        if (err) return [err, offset, state.value];
        err = reducer(state, res[2]);
        if (err) return [err, offset, state.value];
    }
    return [null, offset, state.value];
}

function reduced(reader, init, reducer) {
    return chained(init, function readReduced(state, buffer, offset) {
        return reduce(reader, reducer, state, buffer, offset);
    });
}
