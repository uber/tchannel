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
var read = require('../lib/read');
var write = require('../lib/write');
var header = require('./header');

module.exports.Request = InitRequest;
module.exports.Response = InitResponse;

var MissingInitHeaderError = TypedError({
    type: 'tchannel.missing-init-header',
    message: 'missing init frame header {field}',
    field: null
});

var RequiredHeaderFields = ['host_port', 'process_name'];

function InitRequest(version, headers) {
    if (!(this instanceof InitRequest)) {
        return new InitRequest(version, headers);
    }
    var self = this;
    self.type = InitRequest.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

InitRequest.TypeCode = 0x01;

function buildInitReqRes(Type, results, buffer, offset) {
    var version = results[0];
    var headers = results[1];
    for (var i = 0; i < RequiredHeaderFields.length; ++i) {
        var field = RequiredHeaderFields[i];
        if (headers[field] === undefined) {
            return [MissingInitHeaderError({field: field}), offset, null];
        }
    }
    var req = new Type(version, headers);
    return [null, offset, req];
}

InitRequest.read = read.chained(read.series([
    read.UInt16BE, // version:2
    header.read2   // nh:2 (hk~2 hv~2){nh}
]), function buildInitReq(results, buffer, offset) {
    return buildInitReqRes(InitRequest, results, buffer, offset);
});

InitRequest.prototype.write = function encode() {
    var self = this;
    for (var i = 0; i < RequiredHeaderFields.length; ++i) {
        var field = RequiredHeaderFields[i];
        if (self.headers[field] === undefined) {
            throw MissingInitHeaderError({field: field});
        }
    }
    return write.series([
        write.UInt16BE(self.version), // version:2
        header.write2(self.headers)   // nh:2 (hk~2 hv~2){nh}
    ]);
};

function InitResponse(version, headers) {
    if (!(this instanceof InitResponse)) {
        return new InitResponse(version, headers);
    }
    var self = this;
    self.type = InitResponse.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}
InitResponse.TypeCode = 0x02;
InitResponse.read = read.chained(read.series([
    read.UInt16BE, // version:2
    header.read2   // nh:2 (hk~2 hv~2){nh}
]), function buildInitReq(results, buffer, offset) {
    return buildInitReqRes(InitResponse, results, buffer, offset);
});
InitResponse.prototype.write = InitRequest.prototype.write;
