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

var read = require('../lib/read');
var write = require('../lib/write');
var Checksum = require('./checksum');
var header = require('./header');

module.exports.Request = CallRequest;
module.exports.Response = CallResponse;

var emptyBuffer = new Buffer(0);
var emptyTracing = require('./lib/trace/empty-tracing');

// TODO: need to support fragmentation and continuation
// TODO: validate transport header names?
// TODO: Checksum-like class for tracing

/* jshint maxparams:10 */

// flags:1 ttl:4 tracing:24 traceflags:1 service~1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
function CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3) {
    if (!(this instanceof CallRequest)) {
        return new CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3);
    }
    if (Buffer.isBuffer(tracing))
        throw new Error('callrequest instantiated with buffer tracing');
    var self = this;
    self.type = CallRequest.TypeCode;
    self.flags = flags || 0;
    self.ttl = ttl || 0;
    self.tracing = tracing || emptyTracing;
    self.service = service || emptyBuffer;
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

CallRequest.read = read.chained(read.series([
    read.UInt8,     // flags:1
    read.UInt32BE,  // ttl:4
    read.UInt64,    // spanid:8
    read.UInt64,    // parentid:8
    read.UInt64,    // traceid:8
    read.UInt8,     // traceflags:1
    read.buf1,      // service~1
    header.read,    // nh:1 (hk~1 hv~1){nh}
    Checksum.read,  // csumtype:1 (csum:4){0,1}
    read.buf2,      // arg1~2
    read.buf2,      // arg2~2
    read.buf2       // arg3~2
]), function buildCallReq(results, buffer, offset) {
    var flags = results[0];
    if (flags & CallRequest.Flags.Fragment) {
        throw new Error('streaming call request not implemented');
    }
    var ttl = results[1];
    var spanid = results[2];
    var parentid = results[3];
    var traceid = results[4];
    var traceflags = results[5];
    var service = results[6];
    var headers = results[7];
    var csum = results[8];
    var arg1 = results[9];
    var arg2 = results[10];
    var arg3 = results[11];
    var err = csum.verify(arg1, arg2, arg3);

    if (err) return [err, offset, null];
    var tracing = {
        spanid: spanid,
        traceid: traceid,
        parentid: parentid,
        flags: traceflags
    };
    var req = new CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3);
    return [null, offset, req];
});

CallRequest.prototype.write = function writeCallReq() {
    var self = this;
    self.csum.update(self.arg1, self.arg2, self.arg3);
    return write.series([
        write.UInt8(self.flags, 'CallRequest flags'),         // flags:1
        write.UInt32BE(self.ttl, 'CallRequest ttl'),          // ttl:4
        write.UInt64(self.tracing.spanid, 'CallRequest tracing.spanid'), // tracing.spanid:8
        write.UInt64(self.tracing.parentid, 'CallRequest tracing.parentid'), // tracing.parentid:8
        write.UInt64(self.tracing.traceid, 'CallRequest tracing.traceid'), // tracing.traceid:8
        write.UInt8(self.tracing.flags, 'CallRequest traceflags'), // traceflags:1
        write.buf1(self.service, 'CallRequest service'),      // service~1
        header.write(self.headers),                           // nh:1 (hk~1 hv~1){nh}
        self.csum.write(),                                    // csumtype:1 (csum:4){0,1}
        write.buf2(self.arg1, 'CallRequest arg1'),            // arg1~2
        write.buf2(self.arg2, 'CallRequest arg2'),            // arg2~2
        write.buf2(self.arg3, 'CallRequest arg3')             // arg3~2
    ]);
};

// flags:1 code:1 tracing:24 traceflags:1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
function CallResponse(flags, code, tracing, headers, csum, arg1, arg2, arg3) {
    if (!(this instanceof CallResponse)) {
        return new CallResponse(flags, code, tracing, headers, csum, arg1, arg2, arg3);
    }
    var self = this;
    self.type = CallResponse.TypeCode;
    self.flags = flags || 0;
    self.code = code || CallResponse.Codes.OK;
    self.tracing = tracing || emptyTracing;
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

CallResponse.read = read.chained(read.series([
    read.UInt8,     // flags:1
    read.UInt8,     // code:1
    read.UInt64,    // tracing.spanid
    read.UInt64,    // tracing.parentid
    read.UInt64,    // tracing.traceid
    read.UInt8,     // traceflags
    header.read,    // nh:1 (hk~1 hv~1){nh}
    Checksum.read,  // csumtype:1 (csum:4){0,1}
    read.buf2,      // arg1~2
    read.buf2,      // arg2~2
    read.buf2       // arg3~2
]), function buildCallRes(results, buffer, offset) {
    var flags = results[0];
    if (flags & CallResponse.Flags.Fragment) {
        throw new Error('streaming call request not implemented');
    }
    var code = results[1];
    var spanid = results[2];
    var parentid = results[3];
    var traceid = results[4];
    var traceflags = results[5];
    var headers = results[6];
    var csum = results[7];
    var arg1 = results[8];
    var arg2 = results[9];
    var arg3 = results[10];
    var err = csum.verify(arg1, arg2, arg3);
    if (err) return [err, offset, null];

    var tracing = {
        spanid: spanid,
        traceid: traceid,
        parentid: parentid,
        flags: traceflags
    };

    var res = new CallResponse(flags, code, tracing, headers, csum, arg1, arg2, arg3);
    return [null, offset, res];
});

CallResponse.prototype.write = function writeCallRes() {
    var self = this;
    self.csum.update(self.arg1, self.arg2, self.arg3);
    return write.series([
        write.UInt8(self.flags, 'CallResponse flags'),         // flags:1
        write.UInt8(self.code, 'CallResponse code'),           // code:1
        write.UInt64(self.tracing.spanid, 'CallResponse tracing.spanid'), // tracing.spanid:8
        write.UInt64(self.tracing.parentid, 'CallResponse tracing.parentid'), // tracing.parentid:8
        write.UInt64(self.tracing.traceid, 'CallResponse tracing.traceid'), // tracing.traceid:8
        write.UInt8(self.tracing.flags, 'CallResponse traceflags'), // traceflags:1
        header.write(self.headers),                            // nh:1 (hk~1 hv~1){nh}
        self.csum.write(),                                     // csumtype:1 (csum:4){0,1}
        write.buf2(self.arg1, 'CallResponse arg1'),            // arg1~2
        write.buf2(self.arg2, 'CallResponse arg2'),            // arg2~2
        write.buf2(self.arg3, 'CallResponse arg3')             // arg3~2
    ]);
};
