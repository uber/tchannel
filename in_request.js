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
    var self = this;

    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.finishEvent = self.defineEvent('finish');
    self.channel = options.channel;

    self.timeout = options.timeout || 0;
    self.tracing = options.tracing || null;
    self.serviceName = options.serviceName || '';
    self.headers = options.headers || {};
    self.checksum = options.checksum || null;
    self.retryFlags = options.retryFlags || null;
    self.connection = options.connection || null;

    self.state = States.Initial;
    self.operations = null;
    self.timeHeapHandle = null;
    self.id = id || 0;
    self.remoteAddr = null;
    self.streamed = false;
    self.arg1 = emptyBuffer;
    self.endpoint = null;
    self.arg2 = emptyBuffer;
    self.arg3 = emptyBuffer;
    self.forwardTrace = false;
    self.span = null;
    self.start = self.channel.timers.now();
    self.timedOut = false;
    self.res = null;

    if (options.tracer) {
        self.setupTracing(options);
    }
}

inherits(TChannelInRequest, EventEmitter);

TChannelInRequest.prototype.type = 'tchannel.incoming-request';

TChannelInRequest.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    // TODO: add:
    // - request id?
    // - tracing id?
    // - other?

    info.requestType = self.type;
    info.requestState = States.describe(self.state);
    info.requestRemoteAddr = self.remoteAddr;
    info.serviceName = self.serviceName;

    if (self.endpoint !== null) {
        info.requestArg1 = self.endpoint;
    } else {
        info.requestArg1 = String(self.arg1);
    }

    return info;
};

TChannelInRequest.prototype.setupTracing = function setupTracing(options) {
    var self = this;

    self.span = options.tracer.setupNewSpan({
        spanid: self.tracing.spanid,
        traceid: self.tracing.traceid,
        parentid: self.tracing.parentid,
        flags: self.tracing.flags,
        remoteName: options.hostPort,
        serviceName: self.serviceName,
        name: '' // fill this in later
    });

    self.span.annotateBinary('cn', self.headers.cn);
    self.span.annotateBinary('as', self.headers.as);
    if (self.connection) {
        self.span.annotateBinary('src', self.connection.remoteName);
    }

    self.span.annotate('sr');
};

TChannelInRequest.prototype.handleFrame = function handleFrame(parts, isLast) {
    var self = this;

    if (parts.length !== 3 || self.state !== States.Initial || !isLast) {
        return errors.ArgStreamUnimplementedError();
    }

    self.arg1 = parts[0] || emptyBuffer;
    self.endpoint = String(self.arg1);
    self.arg2 = parts[1] || emptyBuffer;
    self.arg3 = parts[2] || emptyBuffer;

    if (self.span) {
        self.span.name = self.endpoint;
    }

    self.emitFinish();

    return null;
};

TChannelInRequest.prototype.emitFinish = function emitFinish() {
    var self = this;

    self.state = States.Done;
    self.finishEvent.emit(self);
};

TChannelInRequest.prototype.onTimeout = function onTimeout(now) {
    var self = this;

    if (!self.res || self.res.state === States.Initial) {
        // TODO: send an error frame response?
        // TODO: emit error on self.res instead / in addition to?
        // TODO: should cancel any pending handler
        self.timedOut = true;
        if (self.operations) {
            self.operations.popInReq(self.id);
        }
        process.nextTick(deferInReqTimeoutErrorEmit);
    }

    function deferInReqTimeoutErrorEmit() {
        var elapsed = now - self.start;
        self.errorEvent.emit(self, errors.RequestTimeoutError({
            id: self.id,
            start: self.start,
            elapsed: elapsed,
            timeout: self.timeout
        }));
    }
};

// TODO: deprecated, remove
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
