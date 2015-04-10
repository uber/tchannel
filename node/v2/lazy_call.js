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
var Result = require('bufrw/Result');
var ArgsRW = require('./args');
var header = require('./header');
var Tracing = require('./tracing');
var argsrw = ArgsRW(bufrw.buf2);

var ResponseCodes = require('./call').Response.Codes;

/* jshint maxparams:10 */

// flags:1 ttl:4 tracing:24 traceflags:1 service~1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
function LazyCallRequest(flags, ttl, tracing, service, tail) {
    var self = this;
    self.type = LazyCallRequest.TypeCode;
    self.flags = flags || 0;
    self.ttl = ttl || 0;
    self.tracing = tracing || Tracing.emptyTracing;
    self.service = service || '';
    self.tail = tail || Buffer(0);
    self.argsOffset = 0;
    self.headers = null;
    self.csum = null;
    self.args = null;
}

LazyCallRequest.TypeCode = 0x03;
LazyCallRequest.RW = bufrw.Base(callReqLength, readCallReqFrom, writeCallReqInto);

LazyCallRequest.prototype.getHeaders = function getHeaders() {
    var self = this;
    if (self.headers === null) {
        var res = header.header1.skipWithin(self.tail, 0);
        if (res.err) return Result.error(res.err);
        self.headers = res.value;
    }
    return Result.just(self.headers);
};

LazyCallRequest.prototype.getChecksum = function getChecksum() {
    var self = this;
    if (self.csum === null) {
        var res = argsrw.readFrom(self, self.tail, self.argsOffset);
        if (res.err) return Result.error(res.err);
    }
    return Result.just(self.csum);
};

LazyCallRequest.prototype.getArgs = function getArgs() {
    var self = this;
    if (self.args === null) {
        var res = argsrw.readFrom(self, self.tail, self.argsOffset);
        if (res.err) return Result.error(res.err);
    }
    return Result.just(self.args);
};

function callReqLength(body) {
    var res;
    var length = 0;

    // flags:1
    length += bufrw.UInt8.width;

    // ttl:4
    length += bufrw.UInt32BE.width;

    // tracing:24 traceflags:1
    res = Tracing.RW.byteLength(body.tracing);
    if (res.err) return res;
    length += res.length;

    // service~1
    res = bufrw.str1.byteLength(body.service);
    if (res.err) return res;
    res.length += length;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    res.length += body.tail.length;

    return res;
}

function readCallReqFrom(buffer, offset) {
    var res;
    var body = new LazyCallRequest();

    // flags:1
    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.flags = res.value;

    // ttl:4
    res = bufrw.UInt32BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.ttl = res.value;

    // tracing:24 traceflags:1
    res = Tracing.RW.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.tracing = res.value;

    // service~1
    res = bufrw.str1.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.service = res.value;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    res = readLazyTail(body, buffer, offset);
    if (!res.err) res.value = body;

    return res;
}

function writeCallReqInto(body, buffer, offset) {
    var res;

    // flags:1
    res = bufrw.UInt8.writeInto(body.flags, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // ttl:4
    res = bufrw.UInt32BE.writeInto(body.ttl, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:24 traceflags:1
    res = Tracing.RW.writeInto(body.tracing, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // service~1
    res = bufrw.str1.writeInto(body.service, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    return writeLazyTail(body, buffer, offset);
}

// flags:1 code:1 tracing:24 traceflags:1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
function LazyCallResponse(flags, code, tracing, tail) {
    var self = this;
    self.type = LazyCallResponse.TypeCode;
    self.flags = flags || 0;
    self.code = code || LazyCallResponse.Codes.OK;
    self.tracing = tracing || Tracing.emptyTracing;
    self.tail = tail || Buffer(0);
    self.argsOffset = 0;
    self.headers = null;
    self.csum = null;
    self.args = null;
}

LazyCallResponse.TypeCode = 0x04;
LazyCallResponse.Codes = ResponseCodes;
LazyCallResponse.RW = bufrw.Base(callResLength, readCallResFrom, writeCallResInto);

function callResLength(body) {
    var res;
    var length = 0;

    // flags:1
    length += bufrw.UInt8.width;
    // code:1
    length += bufrw.UInt8.width;

    // tracing:24 traceflags:1
    res = Tracing.RW.byteLength(body.tracing);
    if (res.err) return res;
    res.length += length;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    res.length += body.tail.length;

    return res;
}

function readCallResFrom(buffer, offset) {
    var res;
    var body = new LazyCallResponse();

    // flags:1
    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.flags = res.value;

    // code:1
    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.code = res.value;

    // tracing:24 traceflags:1
    res = Tracing.RW.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.tracing = res.value;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    res = readLazyTail(body, buffer, offset);
    if (!res.err) res.value = body;

    return res;
}

function writeCallResInto(body, buffer, offset) {
    var res;

    // flags:1
    res = bufrw.UInt8.writeInto(body.flags, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // code:1
    res = bufrw.UInt8.writeInto(body.code, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:24 traceflags:1
    res = Tracing.RW.writeInto(body.tracing, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*
    return writeLazyTail(body, buffer, offset);
}

function readLazyTail(body, buffer, offset) {
    var start = offset;
    var res;

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.skipWithin(buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // csumtype:1 (csum:4){0,1} (arg~2)*
    body.argsOffset = offset;
    res = argsrw.skipWithin(body, buffer, offset);
    if (res.err) return res;

    body.tail = buffer.slice(start, offset);

    return res;
}

function writeLazyTail(body, buffer, offset) {
    var copied = body.tail.copy(buffer, offset);
    if (copied < body.tail.length) {
        return bufrw.WriteResult.shortError(body.tail.length, copied, offset);
    }
    offset += copied;
    return bufrw.WriteResult.just(offset);
}
