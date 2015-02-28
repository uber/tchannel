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

var NullKeyError = TypedError({
    type: 'tchannel.null-key',
    message: 'null key'
});

// nh:1 (hk~1 hv~1){nh}
module.exports.read = read.chained(read.UInt8, function readHeaders(numHeaders, buffer, offset) {
    var headers = {};
    for (var i=0; i<numHeaders; i++) {
        var res = read.pair1(buffer, offset);
        if (res[0]) return res;
        offset = res[1];
        var pair = res[2];
        if (!pair[0].length) {
            return [NullKeyError(), offset, null];
        }
        var key = String(pair[0]);
        var val = String(pair[1]);
        if (headers[key] !== undefined) {
            return [DuplicateHeaderKeyError({
                key: key,
                value: val,
                priorValue: headers[key]
            }), offset, null];
        }
        headers[key] = val;
    }
    return [null, offset, headers];
});

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

// nh:2 (hk~2 hv~2){nh}
module.exports.read2 = read.chained(read.UInt16BE, function readHeaders(numHeaders, buffer, offset) {
    var headers = {};
    for (var i=0; i<numHeaders; i++) {
        var res = read.pair2(buffer, offset);
        if (res[0]) return res;
        offset = res[1];
        var pair = res[2];
        if (!pair[0].length) {
            return [NullKeyError(), offset, null];
        }
        var key = String(pair[0]);
        var val = String(pair[1]);
        if (headers[key] !== undefined) {
            return [DuplicateHeaderKeyError({
                key: key,
                value: val,
                priorValue: headers[key]
            }), offset, null];
        }
        headers[key] = val;
    }
    return [null, offset, headers];
});

// nh:2 (hk~2 hv~2){nh}
module.exports.write2 = function write2Headers(headers) {
    var keys = Object.keys(headers);
    var parts = new Array(1 + 2 * keys.length);
    parts[0] = write.UInt16BE(keys.length);
    for (var i=0, j=0; i<keys.length; i++) {
        var key = write.buf2(keys[i], 'header key');
        var val = write.buf2(headers[keys[i]], 'header val');
        parts[++j] = key;
        parts[++j] = val;
    }
    return write.series(parts);
};
