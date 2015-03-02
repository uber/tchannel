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
var bufrw = require('bufrw');
var inherits = require('util').inherits;

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

// TODO: different struct pattern that doesn't realize a temporary list of
// [key, val] tuples may be better. At the very least, such structure would
// allow for more precise error reporting.

function HeaderRW(countrw, keyrw, valrw) {
    if (!(this instanceof HeaderRW)) {
        return new HeaderRW(countrw, keyrw, valrw);
    }
    var self = this;
    self.keyrw = keyrw;
    self.valrw = valrw;
    var keyvalrw = bufrw.Series([self.keyrw, self.valrw]);
    bufrw.Repeat.call(self, countrw, keyvalrw);
}
inherits(HeaderRW, bufrw.Repeat);

HeaderRW.prototype.byteLength = function byteLength(headers) {
    // TODO: bit wasteful
    var self = this;
    var keys = Object.keys(headers);
    var keyvals = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        keyvals[i] = [keys[i], headers[keys[i]]];
    }
    return bufrw.Repeat.prototype.byteLength.call(self, keyvals);
};

HeaderRW.prototype.writeInto = function writeInto(headers, buffer, offset) {
    var self = this;
    var keys = Object.keys(headers);
    var keyvals = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        keyvals[i] = [keys[i], headers[keys[i]]];
    }
    return bufrw.Repeat.prototype.writeInto.call(self, keyvals, buffer, offset);
};

HeaderRW.prototype.readFrom = function readFrom(buffer, offset) {
    var self = this;
    var res = bufrw.Repeat.prototype.readFrom.call(self, buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    var keyvals = res.value;

    var headers = {};
    for (var i = 0; i < keyvals.length; i++) {
        var keyval = keyvals[i];
        var key = keyval[0];
        var val = keyval[1];
        if (!key.length) {
            return bufrw.ReadResult.error(NullKeyError(), offset, headers);
        }
        if (headers[key] !== undefined) {
            return bufrw.ReadResult.error(DuplicateHeaderKeyError({
                key: key,
                value: val,
                priorValue: headers[key]
            }), offset, headers);
        }
        headers[key] = val;
    }

    return bufrw.ReadResult.just(offset, headers);
};

module.exports = HeaderRW;

// nh:1 (hk~1 hv~1){nh}
module.exports.header1 = HeaderRW(bufrw.UInt8, bufrw.str1, bufrw.str1);

// nh:2 (hk~2 hv~2){nh}
module.exports.header2 = HeaderRW(bufrw.UInt16BE, bufrw.str2, bufrw.str2);
