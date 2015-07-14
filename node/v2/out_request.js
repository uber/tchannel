// Copyright (c) 2015 Uber Technologies, Inc.
//
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

var inherits = require('util').inherits;

var OutRequest = require('../out_request');
var StreamingOutRequest = require('../streaming_out_request');

var CallFlags = require('./call_flags');
var v2 = require('./index');
var errors = require('../errors');

function creatOutRequest(handler, id, options) {
    return outRequestPool.allocate(handler, id, options);
}

function V2OutRequest(handler, id, options) {
    var self = this;
    self.setup(handler, id, options);
}

inherits(V2OutRequest, OutRequest);

V2OutRequest.prototype.setup = function setup(handler, id, options) {
    /*max-statements: [2, 50]*/
    var self = this;

    OutRequest.call(self, id, options);
    self.handler = handler;
};

V2OutRequest.prototype.release = function release() {
    var self = this;
    outRequestPool.release(self);
};

function V2StreamingOutRequest(handler, id, options) {
    var self = this;
    StreamingOutRequest.call(self, id, options);

    self.handler = handler;
}

inherits(V2StreamingOutRequest, StreamingOutRequest);

V2OutRequest.prototype._sendCallRequest =
V2StreamingOutRequest.prototype._sendCallRequest =
function _sendCallRequest(args, isLast) {
    var self = this;
    var flags = 0;
    if (!isLast) {
        flags |= CallFlags.Fragment;
    }

    if (args && args[0] && args[0].length > v2.CallRequest.MaxArg1Size) {
        self.errorEvent.emit(self, errors.Arg1OverLengthLimit({
                length: '0x' + args[0].length.toString(16),
                limit: '0x' + v2.CallRequest.MaxArg1Size.toString(16)
        }));
        return false;
    }

    self.handler.sendCallRequestFrame(self, flags, args);
};

V2OutRequest.prototype._sendCallRequestCont =
V2StreamingOutRequest.prototype._sendCallRequestCont =
function _sendCallRequestCont(args, isLast) {
    var self = this;
    var flags = 0;
    if (!isLast) {
        flags |= CallFlags.Fragment;
    }

    self.handler.sendCallRequestContFrame(self, flags, args);
};

var outRequestPool = require('../lib/object_pool')({
    name: 'V2OutRequest',
    staticPoolSize: 1000,
    maxPoolSize: 1000,
    // staticPoolSize: 0,
    // maxPoolSize: 0,
    create: function createOutRequest(handler, id, options) {
        var obj = new V2OutRequest(handler, id, options);
        return obj;
    }
});

module.exports.OutRequest = V2OutRequest;
module.exports.OutRequest.create = creatOutRequest;
module.exports.StreamingOutRequest = V2StreamingOutRequest;
