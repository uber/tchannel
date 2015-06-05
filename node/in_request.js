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

function TChannelInRequest(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.finishEvent = self.defineEvent('finish');

    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.serviceName = options.serviceName || '';
    self.remoteAddr = null;
    self.headers = options.headers || {};
    self.checksum = options.checksum || null;
    self.streamed = false;
    self.arg1 = emptyBuffer;
    self.arg2 = emptyBuffer;
    self.arg3 = emptyBuffer;
    self.connection = options.connection;

    if (options.tracer) {
        self.span = options.tracer.setupNewSpan({
            spanid: self.tracing.spanid,
            traceid: self.tracing.traceid,
            parentid: self.tracing.parentid,
            flags: self.tracing.flags,
            hostPort: options.hostPort,
            serviceName: self.serviceName,
            name: '' // fill this in later
        });

        // TODO: better annotations
        self.span.annotate('sr');
    } else {
        self.span = null;
    }

    self.start = self.timers.now();
    self.timedOut = false;
    self.res = null;

    self.finishEvent.on(self.onFinish);
}

inherits(TChannelInRequest, EventEmitter);

TChannelInRequest.prototype.type = 'tchannel.incoming-request';

TChannelInRequest.prototype.onFinish = function onFinish(_arg, self) {
    self.state = States.Done;
};

TChannelInRequest.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    if (!parts) return;
    if (parts.length !== 3 || self.state !== States.Initial) {
        self.errorEvent.emit(self, new Error(
            'un-streamed argument defragmentation is not implemented'));
    }
    self.arg1 = parts[0] || emptyBuffer;
    self.arg2 = parts[1] || emptyBuffer;
    self.arg3 = parts[2] || emptyBuffer;
    if (self.span) self.span.name = String(self.arg1);
    self.finishEvent.emit(self);
};

TChannelInRequest.prototype.checkTimeout = function checkTimeout() {
    var self = this;
    if (!self.timedOut) {
        var elapsed = self.timers.now() - self.start;
        if (elapsed > self.ttl) {
            self.timedOut = true;
            // TODO: send an error frame response?
            // TODO: emit error on self.res instead / in additon to?
            // TODO: should cancel any pending handler
            process.nextTick(function deferInReqTimeoutErrorEmit() {
                self.errorEvent.emit(self, errors.RequestTimeoutError({
                    id: self.id,
                    start: self.start,
                    elapsed: elapsed,
                    timeout: self.ttl
                }));
            });
        }
    }
    return self.timedOut;
};

TChannelInRequest.prototype.withArg1 = function withArg1(callback) {
    var self = this;
    callback(null, self.arg1);
};

TChannelInRequest.prototype.withArg2 = function withArg23(callback) {
    var self = this;
    callback(null, self.arg2);
};

TChannelInRequest.prototype.withArg23 = function withArg23(callback) {
    var self = this;
    callback(null, self.arg2, self.arg3);
};

module.exports = TChannelInRequest;
