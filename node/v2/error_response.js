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
var Tracing = require('./tracing');
var util = require('util');

var errors = require('../errors');
var LiteError = require('../lib/lite_error');

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
CodeErrors[Codes.Timeout] = function TChannelTimeoutError(originalId, message) {
    this.type = this.fullType = 'tchannel.timeout';
    this.message = message || 'TChannel timeout';
    this.isErrorFrame = true;
    this.codeName = 'Timeout';
    this.errorCode = Codes.Timeout;
    this.originalId = originalId;
    this.name = 'TchannelTimeoutError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.Timeout], LiteError);

CodeErrors[Codes.Cancelled] = function TChannelCancelledError(originalId, message) {
    this.type = this.fullType = 'tchannel.cancelled';
    this.message = message || 'TChannel cancelled';
    this.isErrorFrame = true;
    this.codeName = 'Cancelled';
    this.errorCode = Codes.Cancelled;
    this.originalId = originalId;
    this.name = 'TchannelCancelledError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.Cancelled], LiteError);

CodeErrors[Codes.Busy] = function TChannelBusyError(originalId, message) {
    this.type = this.fullType = 'tchannel.busy';
    this.message = message || 'TChannel busy';
    this.isErrorFrame = true;
    this.codeName = 'Busy';
    this.errorCode = Codes.Busy;
    this.originalId = originalId;
    this.name = 'TchannelBusyError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.Busy], LiteError);

CodeErrors[Codes.Declined] = function TChannelDeclinedError(originalId, message) {
    this.type = this.fullType = 'tchannel.declined';
    this.message = message || 'TChannel declined';
    this.isErrorFrame = true;
    this.codeName = 'Declined';
    this.errorCode = Codes.Declined;
    this.originalId = originalId;
    this.name = 'TchannelDeclinedError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.Declined], LiteError);

CodeErrors[Codes.UnexpectedError] = function TChannelUnexpectedError(originalId, message) {
    this.type = this.fullType = 'tchannel.unexpected';
    this.message = message || 'TChannel unexpected error';
    this.isErrorFrame = true;
    this.codeName = 'UnexpectedError';
    this.errorCode = Codes.UnexpectedError;
    this.originalId = originalId;
    this.name = 'TchannelUnexpectedError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.UnexpectedError], LiteError);

CodeErrors[Codes.BadRequest] = function TChannelBadRequestError(originalId, message) {
    this.type = this.fullType = 'tchannel.bad-request';
    this.message = message || 'TChannel bad request';
    this.isErrorFrame = true;
    this.codeName = 'BadRequest';
    this.errorCode = Codes.BadRequest;
    this.originalId = originalId;
    this.name = 'TchannelBadRequestError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.BadRequest], LiteError);

CodeErrors[Codes.NetworkError] = function TChannelNetworkError(originalId, message) {
    this.type = this.fullType = 'tchannel.network';
    this.message = message || 'TChannel network error';
    this.isErrorFrame = true;
    this.codeName = 'NetworkError';
    this.errorCode = Codes.NetworkError;
    this.originalId = originalId;
    this.name = 'TchannelNetworkError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.NetworkError], LiteError);

CodeErrors[Codes.ProtocolError] = function TChannelProtocolError(originalId, message) {
    this.type = this.fullType = 'tchannel.protocol';
    this.message = message || 'TChannel protocol error';
    this.isErrorFrame = true;
    this.codeName = 'ProtocolError';
    this.errorCode = Codes.ProtocolError;
    this.originalId = originalId;
    this.name = 'TchannelProtocolError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.ProtocolError], LiteError);

CodeErrors[Codes.Unhealthy] = function TChannelUnhealthyError(originalId, message) {
    this.type = this.fullType = 'tchannel.unhealthy';
    this.message = message || 'TChannel unhealthy';
    this.isErrorFrame = true;
    this.codeName = 'Unhealthy';
    this.errorCode = Codes.Unhealthy;
    this.originalId = originalId;
    this.name = 'TchannelUnhealthyError';
    LiteError.call(this);
};
util.inherits(CodeErrors[Codes.Unhealthy], LiteError);

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
