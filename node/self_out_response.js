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

var InResponse = require('./in_response');
var OutResponse = require('./out_response');
var StreamingInResponse = require('./streaming_in_response');
var StreamingOutResponse = require('./streaming_out_response');
var v2 = require('./v2');

function SelfOutResponse(conn, inreq, id, options) {
    var self = this;
    OutResponse.call(self, id, options);
    self.conn = conn;
    self.inreq = inreq;
    self.first = true;
    self.makeInres(id, options);
}
inherits(SelfOutResponse, OutResponse);

function SelfStreamingOutResponse(conn, inreq, id, options) {
    var self = this;
    OutResponse.call(self, id, options);
    self.conn = conn;
    self.inreq = inreq;
    self.first = true;
    self.makeInres(id, options);
}
inherits(SelfStreamingOutResponse, StreamingOutResponse);

SelfOutResponse.prototype.makeInres =
SelfStreamingOutResponse.prototype.makeInres =
function makeInres(id, options) {
    var self = this;
    if (options.streamed) {
        self.inres = new StreamingInResponse(self.id, options);
    } else {
        self.inres = new InResponse(self.id, options);
    }
};

SelfOutResponse.prototype._sendCallResponse =
SelfStreamingOutResponse.prototype._sendCallResponse =
SelfOutResponse.prototype._sendCallResponseCont =
SelfStreamingOutResponse.prototype._sendCallResponseCont =
function passResponse(args, isLast ) {
    var self = this;
    self.inres.handleFrame(args, isLast);
    if (self.first) {
        self.inres.code = self.code;
        self.inres.ok = self.ok;
        self.first = false;
        process.nextTick(emitResponse);
    }
    if (!self.closing) self.conn.ops.lastTimeoutTime = 0;

    function emitResponse() {
        self.inreq.responseEvent.emit(self, self.inres);
    }
};

SelfOutResponse.prototype._sendError =
SelfStreamingOutResponse.prototype._sendError =
function passError(codeString, message) {
    var self = this;
    var code = v2.ErrorResponse.Codes[codeString];
    var err = v2.ErrorResponse.CodeErrors[code]({
        originalId: self.id,
        message: message
    });
    if (!self.closing) self.conn.ops.lastTimeoutTime = 0;
    process.nextTick(emitError);

    function emitError() {
        self.inreq.outreq.emitError(err);
    }
};

module.exports.OutResponse = SelfOutResponse;
module.exports.StreamingOutResponse = SelfStreamingOutResponse;
