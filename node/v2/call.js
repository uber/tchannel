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

var Flags;
process.nextTick(function() {
    Flags = require('./index').CallFlags;
});

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
}

CallRequest.Cont = require('./cont').RequestCont;
CallRequest.TypeCode = 0x03;
CallRequest.RW = bufrw.Struct(CallRequest, [
    {name: 'flags', rw: bufrw.UInt8},      // flags:1
    {name: 'ttl', rw: bufrw.UInt32BE},     // ttl:4
    {name: 'tracing', rw: Tracing.RW},     // tracing:24 traceflags:1
    {name: 'service', rw: bufrw.str1},     // service~1
    {name: 'headers', rw: header.header1}, // nh:1 (hk~1 hv~1){nh}
    {name: 'csum', rw: Checksum.RW},       // csumtype:1 (csum:4){0,1}
    {call: argsrw}                         // (arg~2)*
]);

CallRequest.prototype.splitArgs = function splitArgs(args, maxSize) {
    var self = this;
    // assert not self.args
    var lenRes = self.constructor.RW.byteLength(self);
    if (lenRes.err) throw lenRes.err;
    var maxBodySize = maxSize - lenRes.length;
    var remain = maxBodySize;
    var first = [];
    var argSize = 2;

    var split = false;
    for (var i = 0; i < args.length; i++) {
        var arg = args[i] || Buffer(0);
        var argLength = argSize + arg.length;
        if (argLength < remain) {
            first.push(arg);
            remain -= argLength;
        } else {
            first.push(arg.slice(0, remain - argSize));
            args = [arg.slice(remain - argSize)].concat(args.slice(i+1));
            split = true;
            break;
        }
    }

    self.args = first;
    var ret = [self];

    if (split) {
        var isLast = !(self.flags & Flags.Fragment);
        self.flags |= Flags.Fragment;
        var cont = new self.constructor.Cont(self.flags, self.csum.type);
        ret = cont.splitArgs(args, maxSize);
        ret.unshift(self);
        if (isLast) ret[ret.length - 1].flags &= ~ Flags.Fragment;
    }

    return ret;
};

CallRequest.prototype.updateChecksum = function updateChecksum() {
    var self = this;
    return self.csum.update(self.args);
};

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
}

CallResponse.Cont = require('./cont').ResponseCont;
CallResponse.TypeCode = 0x04;
CallResponse.Codes = ResponseCodes;
CallResponse.RW = bufrw.Struct(CallResponse, [
    {name: 'flags', rw: bufrw.UInt8},      // flags:1
    {name: 'code', rw: bufrw.UInt8},       // code:1
    {name: 'tracing', rw: Tracing.RW},     // tracing:24 traceflags:1
    {name: 'headers', rw: header.header1}, // nh:1 (hk~1 hv~1){nh}
    {name: 'csum', rw: Checksum.RW},       // csumtype:1 (csum:4){0},1}
    {call: argsrw}                         // (arg~2)*
]);

CallResponse.prototype.splitArgs = CallRequest.prototype.splitArgs;

CallResponse.prototype.updateChecksum = function updateChecksum() {
    var self = this;
    return self.csum.update(self.args);
};

CallResponse.prototype.verifyChecksum = function verifyChecksum() {
    var self = this;
    return self.csum.verify(self.args);
};
