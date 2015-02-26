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
var read = require('../lib/read');
var write = require('../lib/write');

var DuplicateHeaderKeyError = TypedError({
    type: 'tchannel.duplicate-header-key',
    message: 'duplicate header key {key}',
    key: null,
    value: null,
    priorValue: null
});

// nh:1 (hk~1 hv~1){nh}
module.exports.read = read.reduced(
    read.pair1,

    read.chained(read.UInt8, function initHeaders(count, buffer, offset) {
        return [null, offset, {
            done: count <= 0,
            remain: count,
            value: {}
        }];
    }),

    function reducePair(state, pair) {
        var key = String(pair[0]);
        var val = String(pair[1]);
        if (state.value[key] !== undefined) {
            var err = DuplicateHeaderKeyError({
                key: key,
                value: val,
                priorValue: state.value[key]
            });
            return err;
        }
        state.value[key] = val;
        state.done = --state.remain <= 0;
        return null;
    }
);

// nh:1 (hk~1 hv~1){nh}
module.exports.write = function writeHeaders(headers) {
    var keys = Object.keys(headers);
    var parts = new Array(1 + 2 * keys.length);
    parts[0] = write.UInt8(keys.length);
    for (var i=0, j=0; i<keys.length; i++) {
        var key = write.buf1(keys[i], 'header key');
        var val = write.buf1(headers[keys[i]], 'header val');
        parts[++j] = key;
        parts[++j] = val;
    }
    return write.series(parts);
};
