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
var header = require('./header');
var errors = require('../errors');

module.exports.Request = InitRequest;
module.exports.Response = InitResponse;

var RequiredHeaderFields = ['host_port', 'process_name'];

function InitRequest(version, headers) {
    var self = this;
    self.type = InitRequest.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

InitRequest.TypeCode = 0x01;

InitRequest.RW = bufrw.Struct(InitRequest, [
    {call: {writeInto: writeFieldGuard}},
    {name: 'version', rw: bufrw.UInt16BE}, // version:2
    {name: 'headers', rw: header.header2}, // nh:2 (hk~2 hv~2){nh}
    {call: {readFrom: readFieldGuard}}
]);

// TODO: MissingInitHeaderError check / guard

function InitResponse(version, headers) {
    var self = this;
    self.type = InitResponse.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

InitResponse.TypeCode = 0x02;

InitResponse.RW = bufrw.Struct(InitResponse, [
    {call: {writeInto: writeFieldGuard}},
    {name: 'version', rw: bufrw.UInt16BE}, // version:2
    {name: 'headers', rw: header.header2}, // nh:2 (hk~2 hv~2){nh}
    {call: {readFrom: readFieldGuard}}
]);


function writeFieldGuard(initBody, buffer, offset) {
    var err = requiredFieldGuard(initBody.headers);
    if (err) return WriteResult.error(err, offset);
    else return WriteResult.just(offset);
}

function readFieldGuard(initBody, buffer, offset) {
    var err = requiredFieldGuard(initBody.headers);
    if (err) return ReadResult.error(err, offset);
    else return ReadResult.just(offset);
}

function requiredFieldGuard(headers) {
    for (var i = 0; i < RequiredHeaderFields.length; i++) {
        var field = RequiredHeaderFields[i];
        if (headers[field] === undefined) {
            return errors.MissingInitHeaderError({field: field});
        }
    }
    return null;
}
