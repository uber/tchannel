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
var Checksum = require('./checksum');
var ArgsRW = require('./args');
var argsrw = ArgsRW(bufrw.buf2);

// flags:1 csumtype:1 (csum:4){0,1} (arg~2)+
function CallRequestCont(flags, csum, args) {
    if (!(this instanceof CallRequestCont)) {
        return new CallRequestCont(flags, csum, args);
    }
    var self = this;
    self.type = CallRequestCont.TypeCode;
    self.flags = flags || 0;
    self.csum = Checksum.objOrType(csum);
    self.args = args || [];
    self.cont = null;
    self._flagsOffset = 0;
}

var flagsReadLen = {
    byteLength: flagsLength,
    writeInto: saveFlagsOffset,
    readFrom: readFlagsFrom
};

var flagsRetWrite = {
    writeInto: writeFlagsInto,
};

function saveFlagsOffset(body, buffer, offset) {
    body._flagsOffset = offset;
    return bufrw.WriteResult.just(offset + bufrw.UInt8.width);
}

function flagsLength() {
    return bufrw.LengthResult.just(bufrw.UInt8.width);
}

function writeFlagsInto(body, buffer, offset) {
    var res = bufrw.UInt8.writeInto(body.flags, buffer, body._flagsOffset);
    if (!res.err) res.offset = offset;
    return res;
}

function readFlagsFrom(body, buffer, offset) {
    return bufrw.UInt8.readFrom(buffer, offset);
}

CallRequestCont.TypeCode = 0x13;
CallRequestCont.Cont = CallRequestCont;
CallRequestCont.RW = bufrw.Struct(CallRequestCont, [
    {name: 'flags', call: flagsReadLen}, // flags:1 -- skipped at first
    {call: argsrw},                      // (arg~2)+
    {call: flagsRetWrite}                // -- rw flags last
]);

CallRequestCont.prototype.verifyChecksum = function verifyChecksum(prior) {
    var self = this;
    return self.csum.verify(self.args, prior);
};

// flags:1 csumtype:1 (csum:4){0,1} (arg~2)+
function CallResponseCont(flags, csum, args) {
    if (!(this instanceof CallResponseCont)) {
        return new CallResponseCont(flags, csum, args);
    }
    var self = this;
    self.type = CallResponseCont.TypeCode;
    self.flags = flags || 0;
    self.csum = Checksum.objOrType(csum);
    self.args = args || [];
    self.cont = null;
    self._flagsOffset = 0;
}

CallResponseCont.TypeCode = 0x14;
CallResponseCont.Cont = CallResponseCont;
CallResponseCont.RW = bufrw.Struct(CallResponseCont, [
    {name: 'flags', call: flagsReadLen}, // flags:1 -- skipped at first
    {call: argsrw},                      // (arg~2)+
    {call: flagsRetWrite}                // -- rw flags last
]);

CallResponseCont.prototype.verifyChecksum = function verifyChecksum(prior) {
    var self = this;
    return self.csum.verify(self.args, prior);
};

module.exports.RequestCont = CallRequestCont;
module.exports.ResponseCont = CallResponseCont;
