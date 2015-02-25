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

module.exports.VERSION = 1;

module.exports.Frame = require('./frame');
module.exports.Header = require('./header');
module.exports.Parser = require('./parser');
module.exports.Handler = require('./handler');

/* jshint camelcase:false */

var types = module.exports.Types = {};
types.reqCompleteMessage = types.req_complete_message = 0x01;
types.reqMessageFragment = types.req_message_fragment = 0x02;
types.reqLastFragment = types.req_last_fragment = 0x03;
types.resCompleteMessage = types.res_complete_message = 0x80;
types.resMessageFragment = types.res_message_fragment = 0x81;
types.resLastFragment = types.res_last_fragment = 0x82;
types.resError = types.res_error = 0xC0;

/* jshint camelcase:true */
