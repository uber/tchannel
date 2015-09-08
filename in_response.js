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

var EventEmitter = require('./lib/event_emitter');
var inherits = require('util').inherits;
var errors = require('./errors');

var States = require('./reqres_states');

var emptyBuffer = Buffer(0);

function TChannelInResponse(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.finishEvent = self.defineEvent('finish');

    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.state = States.Initial;
    self.remoteAddr = null;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.headers = options.headers || {};
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.span = options.span || null;

    self.streamed = false;
    self._argstream = null;
    self.arg1 = emptyBuffer;
    self.arg2 = emptyBuffer;
    self.arg3 = emptyBuffer;

    self.start = self.timers.now();

    self.finishEvent.on(self.onFinish);
}

inherits(TChannelInResponse, EventEmitter);

TChannelInResponse.prototype.type = 'tchannel.incoming-response';

TChannelInResponse.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    info.responseId = self.id;
    info.responseType = self.type;
    info.responseState = States.describe(self.state);
    info.responseOk = self.ok;

    return info;
};

TChannelInResponse.prototype.onFinish = function onFinish(_arg, self) {
    self.state = States.Done;
};

TChannelInResponse.prototype.handleFrame = function handleFrame(parts, isLast) {
    var self = this;

    if (parts.length !== 3 || self.state !== States.Initial || !isLast) {
        return errors.ArgStreamUnimplementedError();
    }

    self.arg1 = parts[0] || emptyBuffer;
    self.arg2 = parts[1] || emptyBuffer;
    self.arg3 = parts[2] || emptyBuffer;

    self.finishEvent.emit(self);

    return null;
};

TChannelInResponse.prototype.withArg23 = function withArg23(callback) {
    var self = this;
    callback(null, self.arg2, self.arg3);
};

module.exports = TChannelInResponse;
