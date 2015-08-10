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

module.exports.VERSION = 2;

var Types = {};
module.exports.Types = Types;

var RetryFlags = require('../retry-flags.js');
var Frame = require('./frame');
var LazyFrame = require('./lazy_frame');

module.exports.CallFlags = require('./call_flags');

var init = require('./init');
Types.InitRequest = init.Request.TypeCode;
Types.InitResponse = init.Response.TypeCode;
Frame.Types[Types.InitRequest] = init.Request;
Frame.Types[Types.InitResponse] = init.Response;
module.exports.InitRequest = init.Request;
module.exports.InitResponse = init.Response;

var call = require('./call');
Types.CallRequest = call.Request.TypeCode;
Types.CallResponse = call.Response.TypeCode;
Frame.Types[Types.CallRequest] = call.Request;
Frame.Types[Types.CallResponse] = call.Response;
module.exports.CallRequest = call.Request;
module.exports.CallResponse = call.Response;
module.exports.MaxArg1Size = 0x4000;

var Cancel = require('./cancel');
Types.Cancel = Cancel.TypeCode;
Frame.Types[Types.Cancel] = Cancel;
module.exports.Cancel = Cancel;

var cont = require('./cont');
Types.CallRequestCont = cont.RequestCont.TypeCode;
Types.CallResponseCont = cont.ResponseCont.TypeCode;
Frame.Types[Types.CallRequestCont] = cont.RequestCont;
Frame.Types[Types.CallResponseCont] = cont.ResponseCont;
module.exports.CallRequestCont = cont.RequestCont;
module.exports.CallResponseCont = cont.ResponseCont;

var Claim = require('./claim');
Types.Claim = Claim.TypeCode;
Frame.Types[Types.Claim] = Claim;
module.exports.Claim = Claim;

var ping = require('./ping');
Types.PingRequest = ping.Request.TypeCode;
Types.PingResponse = ping.Response.TypeCode;
Frame.Types[Types.PingRequest] = ping.Request;
Frame.Types[Types.PingResponse] = ping.Response;
module.exports.PingRequest = ping.Request;
module.exports.PingResponse = ping.Response;

var ErrorResponse = require('./error_response');
Types.ErrorResponse = ErrorResponse.TypeCode;
Frame.Types[Types.ErrorResponse] = ErrorResponse;
module.exports.ErrorResponse = ErrorResponse;

module.exports.Checksum = require('./checksum');

module.exports.Frame = Frame;
module.exports.LazyFrame = LazyFrame;

module.exports.parseRetryFlags = function parseRetryFlags(val) {
    val = val || 'c';
    var never = val.indexOf('n') > -1;
    var onConnectionError = !never && val.indexOf('c') > -1;
    var onTimeout = !never && val.indexOf('t') > -1;

    return new RetryFlags(
        never, onConnectionError, onTimeout
    );
};

module.exports.encodeRetryFlags = function encodeRetryFlags(retryFlags) {
    if (!retryFlags) return '';
    var re = '';
    if (retryFlags.never) {
        re += 'n';
    } else {
        if (retryFlags.onConnectionError) re += 'c';
        if (retryFlags.onTimeout) re += 't';
    }
    return re;
};

module.exports.Handler = require('./handler');
