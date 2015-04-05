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
var ArgsRW = require('./args');
var Checksum = require('./checksum');
var header = require('./header');
var Tracing = require('./tracing');
var argsrw = ArgsRW(bufrw.buf2);

var ResponseCodes = {
    OK: 0x00,
    Error: 0x01
};

module.exports.Request = CallRequest;
module.exports.Response = CallResponse;

// TODO: validate transport header names?
// TODO: Checksum-like class for tracing

/* jshint maxparams:10 */

// flags:1 ttl:4 tracing:24 traceflags:1 service~1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
function CallRequest(flags, ttl, tracing, service, headers, csum, args) {
    var self = this;
    self.type = CallRequest.TypeCode;
    self.flags = flags || 0;
    self.ttl = ttl || 0;
    self.tracing = tracing || Tracing.emptyTracing;
    self.service = service || '';
    self.headers = headers || {};
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

CallRequest.Cont = require('./cont').RequestCont;
CallRequest.TypeCode = 0x03;
CallRequest.RW = bufrw.Struct(CallRequest, [
    {name: 'flags', call: flagsReadLen},   // flags:1 -- skipped at first
    {name: 'ttl', rw: bufrw.UInt32BE},     // ttl:4
    {name: 'tracing', rw: Tracing.RW},     // tracing:24 traceflags:1
    {name: 'service', rw: bufrw.str1},     // service~1
    {name: 'headers', rw: header.header1}, // nh:1 (hk~1 hv~1){nh}
    {call: argsrw},                        // (arg~2)*
    {call: flagsRetWrite}                  // -- rw flags last
]);

CallRequest.prototype.verifyChecksum = function verifyChecksum() {
    var self = this;
    return self.csum.verify(self.args);
};

// flags:1 code:1 tracing:24 traceflags:1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
function CallResponse(flags, code, tracing, headers, csum, args) {
    var self = this;
    self.type = CallResponse.TypeCode;
    self.flags = flags || 0;
    self.code = code || CallResponse.Codes.OK;
    self.tracing = tracing || Tracing.emptyTracing;
    self.headers = headers || {};
    self.csum = Checksum.objOrType(csum);
    self.args = args || [];
    self.cont = null;
    self._flagsOffset = 0;
}

CallResponse.Cont = require('./cont').ResponseCont;
CallResponse.TypeCode = 0x04;
CallResponse.Codes = ResponseCodes;
CallResponse.RW = bufrw.Struct(CallResponse, [
    {name: 'flags', call: flagsReadLen},   // flags:1 -- skipped at first
    {name: 'code', rw: bufrw.UInt8},       // code:1
    {name: 'tracing', rw: Tracing.RW},     // tracing:24 traceflags:1
    {name: 'headers', rw: header.header1}, // nh:1 (hk~1 hv~1){nh}
    {call: argsrw},                        // (arg~2)*
    {call: flagsRetWrite}                  // -- rw flags last
]);

CallResponse.prototype.verifyChecksum = function verifyChecksum() {
    var self = this;
    return self.csum.verify(self.args);
};
