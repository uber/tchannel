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
var WriteResult = bufrw.WriteResult;
var ReadResult = bufrw.ReadResult;
var Checksum = require('./checksum');
var header = require('./header');
var Tracing = require('./tracing');

module.exports.Request = CallRequest;
module.exports.Response = CallResponse;

var emptyBuffer = new Buffer(0);

// TODO: need to support fragmentation and continuation
// TODO: validate transport header names?
// TODO: Checksum-like class for tracing

/* jshint maxparams:10 */

// flags:1 ttl:4 tracing:24 traceflags:1 service~1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
function CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3) {
    if (!(this instanceof CallRequest)) {
        return new CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3);
    }
    var self = this;
    self.type = CallRequest.TypeCode;
    self.flags = flags || 0;
    self.ttl = ttl || 0;
    self.tracing = tracing || Tracing.emptyTracing;
    self.service = service || '';
    self.headers = headers || {};
    if (csum === undefined || csum === null) {
        self.csum = Checksum(Checksum.Types.None);
    } else {
        self.csum = Checksum.objOrType(csum);
    }
    self.arg1 = arg1 || emptyBuffer;
    self.arg2 = arg2 || emptyBuffer;
    self.arg3 = arg3 || emptyBuffer;
}

CallRequest.TypeCode = 0x03;

CallRequest.Flags = {
    Fragment: 0x01
};

CallRequest.RW = bufrw.Struct(CallRequest, [
    {call: {writeInto: prepareWrite}},
    {name: 'flags', rw: bufrw.UInt8},            // flags:1
    {name: 'ttl', rw: bufrw.UInt32BE},           // ttl:4
    {name: 'tracing', rw: Tracing.RW},           // tracing:24 traceflags:1
    {name: 'service', rw: bufrw.str1},           // service~1
    {name: 'headers', rw: header.header1},       // nh:1 (hk~1 hv~1){nh}
    {name: 'csum', rw: Checksum.RW},             // csumtype:1 (csum:4){0,1}
    {name: 'arg1', rw: bufrw.buf2},              // arg1~2
    {name: 'arg2', rw: bufrw.buf2},              // arg2~2
    {name: 'arg3', rw: bufrw.buf2},              // arg3~2
    {call: {readFrom: readGuard}}
]);

// flags:1 code:1 tracing:24 traceflags:1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
function CallResponse(flags, code, tracing, headers, csum, arg1, arg2, arg3) {
    if (!(this instanceof CallResponse)) {
        return new CallResponse(flags, code, tracing, headers, csum, arg1, arg2, arg3);
    }
    var self = this;
    self.type = CallResponse.TypeCode;
    self.flags = flags || 0;
    self.code = code || CallResponse.Codes.OK;
    self.tracing = tracing || Tracing.emptyTracing;
    self.headers = headers || {};
    if (csum === undefined || csum === null) {
        self.csum = Checksum(Checksum.Types.None);
    } else {
        self.csum = Checksum.objOrType(csum);
    }
    self.arg1 = arg1 || emptyBuffer;
    self.arg2 = arg2 || emptyBuffer;
    self.arg3 = arg3 || emptyBuffer;
}

CallResponse.TypeCode = 0x04;

CallResponse.Flags = {
    Fragment: 0x01
};

CallResponse.Codes = {
    OK: 0x00,
    Error: 0x01
};

CallResponse.RW = bufrw.Struct(CallResponse, [
    {call: {writeInto: prepareWrite}},
    {name: 'flags', rw: bufrw.UInt8},            // flags:1
    {name: 'code', rw: bufrw.UInt8},             // code:1
    {name: 'tracing', rw: Tracing.RW},           // tracing:24 traceflags:1
    {name: 'headers', rw: header.header1},       // nh:1 (hk~1 hv~1){nh}
    {name: 'csum', rw: Checksum.RW},             // csumtype:1 (csum:4){0},1}
    {name: 'arg1', rw: bufrw.buf2},              // arg1~2
    {name: 'arg2', rw: bufrw.buf2},              // arg2~2
    {name: 'arg3', rw: bufrw.buf2},              // arg3~2
    {call: {readFrom: readGuard}}
]);

function prepareWrite(body, buffer, offset) {
    if (body.flags & CallRequest.Flags.Fragment) {
        return WriteResult.error(
            new Error('streaming call not implemented'),
            offset);
    }
    body.csum.update([body.arg1, body.arg2, body.arg3]);
    return WriteResult.just(offset);
}

function readGuard(body, buffer, offset) {
    if (body.flags & CallRequest.Flags.Fragment) {
        return ReadResult.error(
            new Error('streaming call not implemented'),
            offset);
    }
    var err = body.csum.verify([body.arg1, body.arg2, body.arg3]);
    if (err) {
        return ReadResult.error(err, offset);
    }
    return ReadResult.just(offset);
}
