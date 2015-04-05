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

var TypedError = require('error/typed');
var inherits = require('util').inherits;
var bufrw = require('bufrw');
var Checksum = require('./checksum');

var LengthResult = bufrw.LengthResult;
var WriteResult = bufrw.WriteResult;
var ReadResult = bufrw.ReadResult;

var InvalidArgumentError = TypedError({
    type: 'invalid-argument',
    message: 'invalid argument, expected array or null',
    argType: null,
    argConstructor: null
});

function ArgsRW(argrw) {
    if (!(this instanceof ArgsRW)) {
        return new ArgsRW(argrw);
    }
    var self = this;
    bufrw.Base.call(self);
    self.argrw = argrw || bufrw.buf2;
}
inherits(ArgsRW, bufrw.Base);

ArgsRW.prototype.byteLength = function byteLength(body) {
    var self = this;
    var length = 0;
    var res;

    res = Checksum.RW.byteLength(body.csum);
    if (res.err) return res;
    length += res.length;

    if (body.args === null) {
        return LengthResult.just(length);
    }

    if (!Array.isArray(body.args)) {
        return LengthResult.error(InvalidArgumentError({
            argType: typeof body.args,
            argConstructor: body.args.constructor.name
        }));
    }

    for (var i = 0; i < body.args.length; i++) {
        res = self.argrw.byteLength(body.args[i]);
        if (res.err) return res;
        length += res.length;
    }

    return LengthResult.just(length);
};

ArgsRW.prototype.writeInto = function writeInto(body, buffer, offset) {
    var self = this;
    var res;

    res = Checksum.RW.writeInto(body.csum, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    for (var i = 0; i < body.args.length; i++) {
        res = self.argrw.writeInto(body.args[i], buffer, offset);
        if (res.err) return res;
        offset = res.offset;
    }

    return WriteResult.just(offset);
};

ArgsRW.prototype.readFrom = function readFrom(body, buffer, offset) {
    var self = this;
    var res;

    // TODO: missing symmetry: verify csum (requires prior somehow)

    res = Checksum.RW.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.csum = res.value;

    body.args = [];
    while (offset < buffer.length) {
        res = self.argrw.readFrom(buffer, offset);
        if (res.err) return res;
        offset = res.offset;
        body.args.push(res.value);
    }

    return ReadResult.just(offset, body);
};

module.exports = ArgsRW;
