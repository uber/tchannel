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

var Frame = require('./frame');

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

var ErrorResponse = require('./error_response');
Types.ErrorResponse = ErrorResponse.TypeCode;
Frame.Types[Types.ErrorResponse] = ErrorResponse;
module.exports.ErrorResponse = ErrorResponse;

module.exports.Checksum = require('./checksum');

module.exports.Frame = Frame;

module.exports.Reader = require('./reader');
module.exports.Handler = require('./handler');
