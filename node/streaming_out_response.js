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

var OutArgStream = require('./argstream').OutArgStream;
var pipelineStreams = require('./lib/pipeline_streams');
var OutResponse = require('./out_response');
var errors = require('./errors');
var States = require('./reqres_states');

function StreamingOutResponse(id, options) {
    var self = this;
    OutResponse.call(self, id, options);
    self.streamed = true;
    self._argstream = OutArgStream();
    self.arg1 = self._argstream.arg1;
    self.arg2 = self._argstream.arg2;
    self.arg3 = self._argstream.arg3;
    self._argstream.errorEvent.on(passError);
    self._argstream.frameEvent.on(onFrame);
    self._argstream.finishEvent.on(onFinish);

    function passError(err) {
        self.errorEvent.emit(self, err);
    }

    function onFrame(tup) {
        var parts = tup[0];
        var isLast = tup[1];
        self.sendParts(parts, isLast);
    }

    function onFinish() {
        self.emitFinish();
    }
}

inherits(StreamingOutResponse, OutResponse);

StreamingOutResponse.prototype.type = 'tchannel.outgoing-response.streaming';

StreamingOutResponse.prototype.sendError = function sendError(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        self.errorEvent.emit(self, errors.ResponseAlreadyDone({
            attempted: 'send error frame: ' + codeString + ': ' + message
        }));
    } else {
        if (self.span) {
            self.span.annotate('ss');
        }
        self.state = States.Error;
        self._argstream.finished = true;
        self.arg1.end();
        self.arg2.end();
        self.arg3.end();
        self._sendError(codeString, message);
        self.emitFinish();
    }
};

StreamingOutResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        self.errorEvent.emit(self, errors.ResponseAlreadyStarted({
            state: self.state
        }));
        return false;
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
    self.arg1.end();
    return true;
};

StreamingOutResponse.prototype.send = function send(res1, res2) {
    var self = this;
    self.arg2.end(res1);
    self.arg3.end(res2);
    return self;
};

StreamingOutResponse.prototype.sendStreams = function sendStreams(res1, res2, callback) {
    var self = this;
    var called = false;
    self.errorEvent.on(onError);
    pipelineStreams(
        [res1, res2],
        [self.arg2, self.arg3],
        finish);
    return self;

    function onError(err) {
        if (!called) {
            called = true;
            if (callback) callback(err);
        }
    }

    function finish() {
        if (!called) {
            called = true;
            if (callback) callback(null);
        }
    }
};

module.exports = StreamingOutResponse;
