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
    self.enforceHeaderCount = options.enforceHeaderCount;
    self.enforceKeyLength = options.enforceKeyLength;
    bufrw.Base.call(self);
}
inherits(HeaderRW, bufrw.Base);

HeaderRW.prototype.byteLength = function byteLength(headers) {
    var self = this;
    var length = 0;
    var keys = Object.keys(headers);
    var res;

    length += self.countrw.width;

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        res = self.keyrw.byteLength(key);
        if (res.err) return res;
        length += res.length;

        res = self.valrw.byteLength(headers[key]);
        if (res.err) return res;
        length += res.length;
    }

    return bufrw.LengthResult.just(length);
};

HeaderRW.prototype.writeInto = function writeInto(headers, buffer, offset) {
    var self = this;
    var keys = Object.keys(headers);
    var res;

    res = self.countrw.writeInto(keys.length, buffer, offset);

    for (var i = 0; i < keys.length; i++) {
        if (res.err) return res;
        offset = res.offset;

        var key = keys[i];
        res = self.keyrw.writeInto(key, buffer, offset);
        if (res.err) return res;
        offset = res.offset;

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

    if (self.enforceHeaderCount && n > 128) {
        return bufrw.ReadResult.error(errors.TooManyHeaders({
            offset: offset,
            endOffset: res.offset,
            count: n
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
        // TODO: check key is 16 bytes; not 16 characters
        } else if (self.enforceKeyLength && key.length > 16) {
            return bufrw.ReadResult.error(errors.TransportHeaderTooLong({
                offset: offset,
                endOffset: res.offset,
                headerName: key
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

module.exports = HeaderRW;

// nh:1 (hk~1 hv~1){nh}
module.exports.header1 = HeaderRW(bufrw.UInt8, bufrw.str1, bufrw.str1, {
    enforceHeaderCount: true,
    enforceKeyLength: true
});

// nh:2 (hk~2 hv~2){nh}
module.exports.header2 = HeaderRW(bufrw.UInt16BE, bufrw.str2, bufrw.str2, {
    enforceHeaderCount: false,
    enforceKeyLength: false
});
