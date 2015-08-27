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

var errors = require('../errors');
var ArgsRW = require('./args');
var Checksum = require('./checksum');
var header = require('./header');
var Tracing = require('./tracing');
var Frame = require('./frame');
var CallFlags = require('./call_flags');
var argsrw = ArgsRW();

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
}

CallRequest.Cont = require('./cont').RequestCont;
CallRequest.TypeCode = 0x03;
CallRequest.RW = bufrw.Base(callReqLength, readCallReqFrom, writeCallReqInto);

CallRequest.RW.lazy = {};

CallRequest.RW.lazy.flagsOffset = Frame.Overhead;
CallRequest.RW.lazy.readFlags = function readFlags(frame) {
    // flags:1
    return bufrw.UInt8.readFrom(frame.buffer, CallRequest.RW.lazy.flagsOffset);
};

CallRequest.RW.lazy.ttlOffset = CallRequest.RW.lazy.flagsOffset + 1;
CallRequest.RW.lazy.readTTL = function readTTL(frame) {
    // ttl:4
    var res = bufrw.UInt32BE.readFrom(frame.buffer, CallRequest.RW.lazy.ttlOffset);
    if (!res.err && res.value <= 0) {
        res.err = errors.InvalidTTL({
            ttl: res.value
        });
    }
    return res;
};
CallRequest.RW.lazy.writeTTL = function writeTTL(ttl, frame) {
    // ttl:4
    return bufrw.UInt32BE.writeInto(ttl, frame.buffer, CallRequest.RW.lazy.ttlOffset);
};

CallRequest.RW.lazy.tracingOffset = CallRequest.RW.lazy.ttlOffset + 4;
CallRequest.RW.lazy.readTracing = function lazyReadTracing(frame) {
    // tracing:24 traceflags:1
    return Tracing.RW.readFrom(frame.buffer, CallRequest.RW.lazy.tracingOffset);
};

CallRequest.RW.lazy.serviceOffset = CallRequest.RW.lazy.tracingOffset + 25;
CallRequest.RW.lazy.readService = function lazyReadService(frame) {
    // service~1
    return bufrw.str1.readFrom(frame.buffer, CallRequest.RW.lazy.serviceOffset);
};

CallRequest.RW.lazy.isFrameTerminal = function isFrameTerminal(frame) {
    var flags = CallRequest.RW.lazy.readFlags(frame);
    var frag = flags & CallFlags.Fragment;
    return !frag;
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
    length += res.length;

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.byteLength(body.headers);
    if (res.err) return res;
    length += res.length;

    // csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body);
    if (!res.err) res.length += length;

    return res;
}

function readCallReqFrom(buffer, offset) {
    var res;
    var body = new CallRequest();

    // flags:1
    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.flags = res.value;

    // ttl:4
    res = bufrw.UInt32BE.readFrom(buffer, offset);
    if (res.err) return res;

    if (res.value <= 0) {
        return bufrw.ReadResult.error(errors.InvalidTTL({
            ttl: res.value
        }), offset, body);
    }

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

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.headers = res.value;

    // csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset);
    if (!res.err) res.value = body;

    return res;
}

function writeCallReqInto(body, buffer, offset) {
    var start = offset;
    var res;

    // flags:1 -- filled in later after argsrw
    offset += bufrw.UInt8.width;

    if (body.ttl <= 0) {
        return bufrw.WriteResult.error(errors.InvalidTTL({
            ttl: body.ttl
        }), offset);
    }

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

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.writeInto(body.headers, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // csumtype:1 (csum:4){0,1} (arg~2)* -- (may mutate body.flags)
    res = argsrw.writeInto(body, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // now we know the final flags, write them
    res = bufrw.UInt8.writeInto(body.flags, buffer, start);
    if (!res.err) res.offset = offset;

    return res;
}

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
}

CallResponse.Cont = require('./cont').ResponseCont;
CallResponse.TypeCode = 0x04;
CallResponse.Codes = ResponseCodes;
CallResponse.RW = bufrw.Base(callResLength, readCallResFrom, writeCallResInto);

CallResponse.RW.lazy = {};

CallResponse.RW.lazy.flagsOffset = Frame.Overhead;
CallResponse.RW.lazy.readFlags = function readFlags(frame) {
    // flags:1
    return bufrw.UInt8.readFrom(frame.buffer, CallResponse.RW.lazy.flagsOffset);
};

CallResponse.RW.lazy.codeOffset = CallResponse.RW.lazy.flagsOffset + 1;
// TODO: readCode?

CallResponse.RW.lazy.tracingOffset = CallResponse.RW.lazy.codeOffset + 1;
CallResponse.RW.lazy.readTracing = function lazyReadTracing(frame) {
    // tracing:24 traceflags:1
    return Tracing.RW.readFrom(frame.buffer, CallResponse.RW.lazy.tracingOffset);
};

CallResponse.RW.lazy.isFrameTerminal = function isFrameTerminal(frame) {
    var flags = CallResponse.RW.lazy.readFlags(frame);
    var frag = flags & CallFlags.Fragment;
    return !frag;
};

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
    length += res.length;

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.byteLength(body.headers);
    if (res.err) return res;
    length += res.length;

    // csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body);
    if (!res.err) res.length += length;

    return res;
}

function readCallResFrom(buffer, offset) {
    var res;
    var body = new CallResponse();

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

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.headers = res.value;

    // csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset);
    if (!res.err) res.value = body;

    return res;
}

function writeCallResInto(body, buffer, offset) {
    var start = offset;
    var res;

    // flags:1 -- filled in later after argsrw
    offset += bufrw.UInt8.width;

    // code:1
    res = bufrw.UInt8.writeInto(body.code, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:24 traceflags:1
    res = Tracing.RW.writeInto(body.tracing, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // nh:1 (hk~1 hv~1){nh}
    res = header.header1.writeInto(body.headers, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // csumtype:1 (csum:4){0,1} (arg~2)* -- (may mutate body.flags)
    res = argsrw.writeInto(body, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // now we know the final flags, write them
    res = bufrw.UInt8.writeInto(body.flags, buffer, start);
    if (!res.err) res.offset = offset;

    return res;
}

CallResponse.prototype.verifyChecksum = function verifyChecksum() {
    var self = this;
    return self.csum.verify(self.args);
};
