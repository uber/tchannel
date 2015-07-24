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

var InRequest = require('./in_request');
var OutRequest = require('./out_request');
var StreamingInRequest = require('./streaming_in_request');
var StreamingOutRequest = require('./streaming_out_request');

function SelfOutRequest(conn, id, options) {
    var self = this;
    OutRequest.call(self, id, options);
    self.conn = conn;
    self.makeInreq(id, options);
}
inherits(SelfOutRequest, OutRequest);

function SelfStreamingOutRequest(conn, id, options) {
    var self = this;
    OutRequest.call(self, id, options);
    self.conn = conn;
    self.makeInreq(id, options);
}
inherits(SelfStreamingOutRequest, StreamingOutRequest);

SelfOutRequest.prototype.makeInreq =
SelfStreamingOutRequest.prototype.makeInreq =
function makeInreq(id, options) {
    var self = this;
    if (self.span) {
        options.tracing = self.span.getTracing();
    }

    var called = false;
    if (options.streamed) {
        self.inreq = new StreamingInRequest(id, options);
    } else {
        self.inreq = new InRequest(id, options);
    }
    self.inreq.responseEvent = self.inreq.defineEvent('response');
    self.inreq.errorEvent.on(onError);
    self.inreq.responseEvent.on(onResponse);
    self.inreq.outreq = self; // TODO: make less hacky when have proper subclasses
    self.inreq.headers = self.headers;

    function onError(err) {
        if (called) return;
        called = true;
        self.conn.ops.popOutReq(id);
        self.errorEvent.emit(self, err);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        self.conn.ops.popOutReq(id);
        self.emitResponse(res);
    }
};

SelfOutRequest.prototype._sendCallRequest =
SelfStreamingOutRequest.prototype._sendCallRequest =
SelfOutRequest.prototype._sendCallRequestCont =
SelfStreamingOutRequest.prototype._sendCallRequestCont =
function passRequestParts(args, isLast ) {
    var self = this;
    self.inreq.handleFrame(args, isLast);
    if (!self.closing) self.conn.ops.lastTimeoutTime = 0;
};

module.exports.OutRequest = SelfOutRequest;
module.exports.StreamingOutRequest = SelfStreamingOutRequest;
