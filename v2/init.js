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

var errors = require('./errors');
var read = require('../lib/read');
var write = require('../lib/write');

module.exports.Request = InitRequest;
module.exports.Response = InitResponse;

function InitRequest(version, hostPort, processName) {
    if (!(this instanceof InitRequest)) {
        return new InitRequest(version, hostPort, processName);
    }
    var self = this;
    self.type = InitRequest.TypeCode;
    self.version = version;
    self.hostPort = hostPort;
    self.processName = processName;
}

InitRequest.TypeCode = 0x01;

function buildInitReqRes(Type, results, buffer, offset) {
    var version = results[0];
    var hostPort;
    var processName;

    for (var i=1; i<results.length; i++) {
        var pair = results[i];
        var k = String(pair[0]);
        var v = String(pair[1]);
        switch (k) {
            case 'host_port':
                if (hostPort) {
                    return [errors.DuplicateInitHeaderError({name: 'host_port'}), offset, null];
                }
                hostPort = v;
                break;
            case 'process_name':
                if (processName) {
                    return [errors.DuplicateInitHeaderError({name: 'process_name'}), offset, null];
                }
                processName = v;
                break;
            default:
                return [errors.InvalidInitHeaderError({name: k}), offset, null];
        }
    }

    var req = new Type(version, hostPort, processName);
    return [null, offset, req];
}

InitRequest.read = read.chained(read.series([
    read.UInt16BE, // version:2
    read.pair2,    // key~2 value~2
    read.pair2     // key~2 value~2
]), function buildInitReq(results, buffer, offset) {
    return buildInitReqRes(InitRequest, results, buffer, offset);
});

InitRequest.prototype.write = function encode() {
    var self = this;
    return write.series([
        write.UInt16BE(self.version),                    // version:2
        write.buf2('host_port'),                         // key~2
        write.buf2(self.hostPort, 'init hostPort'),      // value~2
        write.buf2('process_name'),                      // key~2
        write.buf2(self.processName, 'init processName') // value~2
    ]);
};

function InitResponse(version, hostPort, processName) {
    if (!(this instanceof InitResponse)) {
        return new InitResponse(version, hostPort, processName);
    }
    var self = this;
    self.type = InitResponse.TypeCode;
    self.version = version;
    self.hostPort = hostPort;
    self.processName = processName;
}
InitResponse.TypeCode = 0x02;
InitResponse.read = read.chained(read.series([
    read.UInt16BE, // version:2
    read.pair2,    // key~2 value~2
    read.pair2     // key~2 value~2
]), function buildInitReq(results, buffer, offset) {
    return buildInitReqRes(InitResponse, results, buffer, offset);
});
InitResponse.prototype.write = InitRequest.prototype.write;
