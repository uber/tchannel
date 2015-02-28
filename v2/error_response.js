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
var Frame = require('./frame');

module.exports = ErrorResponse;

var emptyBuffer = new Buffer(0);

// TODO: enforce message ID of this frame is Frame.NullId when
// errorBody.code.ProtocolError = ErrorResponse.Codes.ProtocolError

// code:1 id:4 message~2
function ErrorResponse(code, id, message) {
    if (!(this instanceof ErrorResponse)) {
        return new ErrorResponse(code, id, message);
    }
    var self = this;
    self.code = code;
    if (id === null || id === undefined) {
        self.id = Frame.NullId;
    } else {
        self.id = id;
    }
    self.message = message ? write.bufferOrString(message) : emptyBuffer;
}

ErrorResponse.TypeCode = 0xff;

var Codes = {
    // 0x00 not a valid value for "code", do not use.
    Timeout: 0x01,
    Cancelled: 0x02,
    Busy: 0x03,
    Declined: 0x04,
    UnexpectedError: 0x05,
    BadRequest: 0x06,
    ProtocolError: 0xff
};

var CodeNames = {};
CodeNames[Codes.Timeout] = 'timeout';
CodeNames[Codes.Cancelled] = 'canceled';
CodeNames[Codes.Busy] = 'busy';
CodeNames[Codes.Declined] = 'declined';
CodeNames[Codes.UnexpectedError] = 'unexpected error';
CodeNames[Codes.BadRequest] = 'bad request';
CodeNames[Codes.ProtocolError] = 'protocol error';

var CodeErrors = {};
CodeErrors[Codes.Timeout] = TypedError({
    type: 'tchannel.timeout',
    errorCode: Codes.Timeout,
    originalId: null
});
CodeErrors[Codes.Cancelled] = TypedError({
    type: 'tchannel.canceled',
    errorCode: Codes.Cancelled,
    originalId: null
});
CodeErrors[Codes.Busy] = TypedError({
    type: 'tchannel.busy',
    errorCode: Codes.Busy,
    originalId: null
});
CodeErrors[Codes.Declined] = TypedError({
    type: 'tchannel.declined',
    errorCode: Codes.Declined,
    originalId: null
});
CodeErrors[Codes.UnexpectedError] = TypedError({
    type: 'tchannel.unexpected',
    errorCode: Codes.UnexpectedError,
    originalId: null
});
CodeErrors[Codes.BadRequest] = TypedError({
    type: 'tchannel.bad-request',
    errorCode: Codes.BadRequest,
    originalId: null
});
CodeErrors[Codes.ProtocolError] = TypedError({
    type: 'tchannel.protocol',
    errorCode: Codes.ProtocolError,
    originalId: null
});

ErrorResponse.Codes = Codes;
ErrorResponse.CodeNames = CodeNames;
ErrorResponse.CodeErrors = CodeErrors;

ErrorResponse.read = read.chained(read.series([
    read.UInt8,    // code:1
    read.UInt32BE, // id:4
    read.buf2      // message~2
]), function buildErrorRes(results, buffer, offset) {
    var code = results[0];
    var id = results[1];
    var message = results[2];
    var res = new ErrorResponse(code, id, message);
    return [null, offset, res];
});

ErrorResponse.prototype.write = function writeErrorRes() {
    var self = this;
    return write.series([
        write.UInt8(self.code, 'ErrorResponse code'),  // code:1
        write.UInt32BE(self.id, 'ErrorResponse id'),   // id:4
        write.buf2(self.message, 'ErrorResponse arg1') // message~2
    ]);
};
