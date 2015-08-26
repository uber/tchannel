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

var bufrw = require('bufrw');
var inherits = require('util').inherits;
var errors = require('../errors');

// TODO: different struct pattern that doesn't realize a temporary list of
// [key, val] tuples may be better. At the very least, such structure would
// allow for more precise error reporting.

function HeaderRW(countrw, keyrw, valrw, options) {
    if (!(this instanceof HeaderRW)) {
        return new HeaderRW(countrw, keyrw, valrw, options);
    }
    var self = this;
    self.countrw = countrw;
    self.keyrw = keyrw;
    self.valrw = valrw;
    self.maxHeaderCount = options.maxHeaderCount;
    self.maxKeyLength = options.maxKeyLength;
    bufrw.Base.call(self);
}
inherits(HeaderRW, bufrw.Base);

HeaderRW.prototype.byteLength = function byteLength(headers) {
    var self = this;
    var length = 0;
    var keys = Object.keys(headers);
    var res;

    if (keys.length > self.maxHeaderCount) {
        return bufrw.LengthResult.error(errors.TooManyHeaders({
            count: keys.length,
            maxHeaderCount: self.maxHeaderCount
        }));
    }

    length += self.countrw.width;

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        res = self.keyrw.byteLength(key);
        if (res.err) return res;
        length += res.length;

        res = self.valrw.byteLength(headers[key]);
        if (res.err) return res;
        if (res.length > self.maxKeyLength) {
            return bufrw.LengthResult.error(errors.TransportHeaderTooLong({
                maxLength: self.maxKeyLength,
                headerName: key
            }));
        }
        length += res.length;
    }

    return bufrw.LengthResult.just(length);
};

HeaderRW.prototype.writeInto = function writeInto(headers, buffer, offset) {
    var self = this;
    var keys = Object.keys(headers);
    var res;

    res = self.countrw.writeInto(keys.length, buffer, offset);

    if (keys.length > self.maxHeaderCount) {
        return bufrw.WriteResult.error(errors.TooManyHeaders({
            count: keys.length,
            maxHeaderCount: self.maxHeaderCount,
            offset: offset,
            endOffset: res.offset
        }), offset);
    }

    for (var i = 0; i < keys.length; i++) {
        if (res.err) return res;
        offset = res.offset;

        var key = keys[i];
        res = self.keyrw.writeInto(key, buffer, offset);
        if (res.err) return res;

        var keyByteLength = res.offset - offset;
        if (keyByteLength > self.maxKeyLength) {
            return bufrw.WriteResult.error(errors.TransportHeaderTooLong({
                maxLength: self.maxKeyLength,
                headerName: key,
                offset: offset,
                endOffset: res.offset
            }), offset);
        }
        offset = res.offset;

        // TODO consider supporting buffers
        if (typeof headers[key] !== 'string') {
            return bufrw.WriteResult.error(errors.InvalidHeaderTypeError({
                name: key,
                headerType: typeof headers[key]
            }), offset);
        }

        res = self.valrw.writeInto(headers[key], buffer, offset);
    }

    return res;
};

HeaderRW.prototype.readFrom = function readFrom(buffer, offset) {
    var self = this;
    var headers = {};
    var start = 0;
    var n = 0;
    var key = '';
    var val = '';
    var res;

    res = self.countrw.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    n = res.value;

    if (n > self.maxHeaderCount) {
        return bufrw.ReadResult.error(errors.TooManyHeaders({
            count: n,
            maxHeaderCount: self.maxHeaderCount,
            offset: offset,
            endOffset: res.offset
        }), offset, headers);
    }

    for (var i = 0; i < n; i++) {
        start = offset;

        res = self.keyrw.readFrom(buffer, offset);
        if (res.err) return res;
        key = res.value;

        if (!key.length) {
            return bufrw.ReadResult.error(errors.NullKeyError({
                offset: offset,
                endOffset: res.offset
            }), offset, headers);
        } else if (res.offset - offset > self.maxKeyLength) {
            return bufrw.ReadResult.error(errors.TransportHeaderTooLong({
                maxLength: self.maxKeyLength,
                headerName: key,
                offset: offset,
                endOffset: res.offset
            }), offset, headers);
        }
        offset = res.offset;

        res = self.valrw.readFrom(buffer, offset);
        if (res.err) return res;
        val = res.value;

        if (headers[key] !== undefined) {
            return bufrw.ReadResult.error(errors.DuplicateHeaderKeyError({
                offset: start,
                endOffset: res.offset,
                key: key,
                value: val,
                priorValue: headers[key]
            }), offset, headers);
        }
        offset = res.offset;

        headers[key] = val;
    }

    return bufrw.ReadResult.just(offset, headers);
};

HeaderRW.prototype.lazySkip = function lazySkip(frame, offset) {
    var self = this;

    // TODO: conspire with Call(Request,Response) to memoize headers start/end
    // offsets, maybe even start of each key?

    var res = self.countrw.readFrom(frame.buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    var n = res.value;

    for (var i = 0; i < n; i++) {
        res = self.keyrw.sizerw.readFrom(frame.buffer, offset);
        if (res.err) return res;
        offset = res.offset + res.value;

        res = self.valrw.sizerw.readFrom(frame.buffer, offset);
        if (res.err) return res;
        offset = res.offset + res.value;
    }

    return bufrw.ReadResult.just(offset, null);
};

module.exports = HeaderRW;

// nh:1 (hk~1 hv~1){nh}
module.exports.header1 = HeaderRW(bufrw.UInt8, bufrw.str1, bufrw.str1, {
    maxHeaderCount: 128,
    maxKeyLength: 16
});

// nh:2 (hk~2 hv~2){nh}
module.exports.header2 = HeaderRW(bufrw.UInt16BE, bufrw.str2, bufrw.str2, {
    maxHeaderCount: Infinity,
    maxKeyLength: Infinity
});
