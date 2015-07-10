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
var TypedError = require('error/typed');
var Tracing = require('./tracing');

var errors = require('../errors');

// TODO: enforce message ID of this frame is Frame.NullId when
// errorBody.code.ProtocolError = ErrorResponse.Codes.ProtocolError

// code:1 tracing:25 message~2
function ErrorResponse(code, tracing, message) {
    var self = this;
    self.code = code || 0;
    self.tracing = tracing || Tracing.emptyTracing;
    self.type = ErrorResponse.TypeCode;
    self.message = message || '';
}

ErrorResponse.TypeCode = 0xff;

var Codes = Object.create(null);
// 0x00 not a valid value for "code", do not use.
Codes.Timeout = 0x01;
Codes.Cancelled = 0x02;
Codes.Busy = 0x03;
Codes.Declined = 0x04;
Codes.UnexpectedError = 0x05;
Codes.BadRequest = 0x06;
Codes.NetworkError = 0x07;
Codes.Unhealthy = 0x08;
Codes.ProtocolError = 0xff;

var CodeNames = Object.create(null);
CodeNames[Codes.Timeout] = 'timeout';
CodeNames[Codes.Cancelled] = 'cancelled';
CodeNames[Codes.Busy] = 'busy';
CodeNames[Codes.Declined] = 'declined';
CodeNames[Codes.UnexpectedError] = 'unexpected error';
CodeNames[Codes.BadRequest] = 'bad request';
CodeNames[Codes.NetworkError] = 'network error';
CodeNames[Codes.ProtocolError] = 'protocol error';
CodeNames[Codes.Unhealthy] = 'unhealthy';

var CodeErrors = Object.create(null);
CodeErrors[Codes.Timeout] = TypedError({
    type: 'tchannel.timeout',
    message: 'TChannel timeout',
    isErrorFrame: true,
    codeName: 'Timeout',
    errorCode: Codes.Timeout,
    originalId: null
});
CodeErrors[Codes.Cancelled] = TypedError({
    type: 'tchannel.cancelled',
    message: 'TChannel cancelled',
    isErrorFrame: true,
    codeName: 'Cancelled',
    errorCode: Codes.Cancelled,
    originalId: null
});
CodeErrors[Codes.Busy] = TypedError({
    type: 'tchannel.busy',
    message: 'TChannel busy',
    isErrorFrame: true,
    codeName: 'Busy',
    errorCode: Codes.Busy,
    originalId: null
});
CodeErrors[Codes.Declined] = TypedError({
    type: 'tchannel.declined',
    message: 'TChannel declined',
    isErrorFrame: true,
    codeName: 'Declined',
    errorCode: Codes.Declined,
    originalId: null
});
CodeErrors[Codes.UnexpectedError] = TypedError({
    type: 'tchannel.unexpected',
    message: 'TChannel unexpected error',
    isErrorFrame: true,
    codeName: 'UnexpectedError',
    errorCode: Codes.UnexpectedError,
    originalId: null
});
CodeErrors[Codes.BadRequest] = TypedError({
    type: 'tchannel.bad-request',
    message: 'TChannel bad request',
    isErrorFrame: true,
    codeName: 'BadRequest',
    errorCode: Codes.BadRequest,
    originalId: null
});
CodeErrors[Codes.NetworkError] = TypedError({
    type: 'tchannel.network',
    message: 'TChannel network error',
    isErrorFrame: true,
    codeName: 'NetworkError',
    errorCode: Codes.NetworkError,
    originalId: null
});
CodeErrors[Codes.ProtocolError] = TypedError({
    type: 'tchannel.protocol',
    message: 'TChannel protocol error',
    isErrorFrame: true,
    codeName: 'ProtocolError',
    errorCode: Codes.ProtocolError,
    originalId: null
});
CodeErrors[Codes.Unhealthy] = TypedError({
    type: 'tchannel.unhealthy',
    message: 'TChannel unhealthy',
    isErrorFrame: true,
    codeName: 'Unhealthy',
    errorCode: Codes.Unhealthy,
    originalId: null
});

ErrorResponse.Codes = Codes;
ErrorResponse.CodeNames = CodeNames;
ErrorResponse.CodeErrors = CodeErrors;

ErrorResponse.RW = bufrw.Struct(ErrorResponse, [
    {call: {writeInto: function writeGuard(body, buffer, offset) {
        if (CodeNames[body.code] === undefined) {
            return WriteResult.error(errors.InvalidErrorCodeError({
                errorCode: body.code,
                tracing: body.tracing
            }), offset);
        }
        return WriteResult.just(offset);
    }}},
    {name: 'code', rw: bufrw.UInt8},   // code:1
    {name: 'tracing', rw: Tracing.RW},  // tracing:25
    {name: 'message', rw: bufrw.str2}, // message~2
    {call: {writeInto: function writeGuard(body, buffer, offset) {
        if (CodeNames[body.code] === undefined) {
            return ReadResult.error(errors.InvalidErrorCodeError({
                errorCode: body.code,
                tracing: body.tracing,
            }), offset);
        }
        return ReadResult.just(offset);
    }}},
]);

ErrorResponse.RW.lazy = {};

ErrorResponse.RW.lazy.isFrameTerminal = function isFrameTerminal() {
    return true;
};

module.exports = ErrorResponse;
