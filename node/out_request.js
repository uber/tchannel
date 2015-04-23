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
var parallel = require('run-parallel');

var errors = require('./errors');
var States = require('./reqres_states');

function TChannelOutRequest(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.responseEvent = self.defineEvent('response');
    self.finishEvent = self.defineEvent('finish');

    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.start = 0;
    self.end = 0;
    self.remoteAddr = options.remoteAddr;
    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;

    self.streamed = false;
    self.arg1 = null;
    self.arg2 = null;
    self.arg3 = null;

    if (options.tracer) {
        // new span with new ids
        self.span = options.tracer.setupNewSpan({
            outgoing: true,
            parentSpan: options.parentSpan,
            topLevelRequest: options.topLevelRequest,
            spanid: null,
            traceid: null,
            parentid: null,
            flags: options.trace? 1 : 0,
            hostPort: self.remoteAddr,
            serviceName: self.service,
            name: '' // fill this in later
        });

        self.tracing = self.span.getTracing();
    } else {
        self.span = null;
    }

    self._callback = null;
    self.err = null;
    self.res = null;
    self.timedOut = false;

    self.errorEvent.on(self.onError);
    self.responseEvent.on(self.onResponse);
}

inherits(TChannelOutRequest, EventEmitter);

TChannelOutRequest.prototype.type = 'tchannel.outgoing-request';

TChannelOutRequest.prototype._sendCallRequest = function _sendCallRequest(args, isLast) {
    var self = this;
    throw errors.UnimplementedMethod({
        className: self.constructor.name,
        methodName: '_sendCallRequest'
    });
};

TChannelOutRequest.prototype._sendCallRequestCont = function _sendCallRequestCont(args, isLast) {
    var self = this;
    throw errors.UnimplementedMethod({
        className: self.constructor.name,
        methodName: '_sendCallRequestCont'
    });
};

TChannelOutRequest.prototype.onError = function onError(err) {
    var self = this;
    if (!self.end) self.end = self.timers.now();
    self.err = err;

    if (self._callback) {
        self._callback(err, null, null);
        self._callback = null;
    }
};

TChannelOutRequest.prototype.onResponse = function onResponse(res) {
    var self = this;
    if (!self.end) self.end = self.timers.now();
    self.res = res;
    self.res.span = self.span;

    if (self._callback) {
        if (self._callback.canStream) {
            self._callback(null, self, res);
            self._callback = null;
        } else if (!res.streamed) {
            self._callback(null, res, res.arg2, res.arg3);
            self._callback = null;
        } else {
            parallel({
                arg2: res.arg2.onValueReady,
                arg3: res.arg3.onValueReady
            }, compatCall);
        }
    }

    function compatCall(err, args) {
        self._callback(err, res, args.arg2, args.arg3);
        self._callback = null;
    }
};

TChannelOutRequest.prototype.sendParts = function sendParts(parts, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendCallRequestFrame(parts, isLast);
            break;
        case States.Streaming:
            self.sendCallRequestContFrame(parts, isLast);
            break;
        case States.Done:
            // TODO: could probably happen normally, like say if a
            // streaming request is canceled
            self.errorEvent.emit(self, errors.RequestFrameState({
                attempted: 'arg parts',
                state: 'Done'
            }));
            break;
        case States.Error:
            // TODO: log warn
            break;
    }
};

TChannelOutRequest.prototype.sendCallRequestFrame = function sendCallRequestFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.start = self.timers.now();
            if (self.span) {
                self.span.annotate('cs');
            }
            self._sendCallRequest(args, isLast);
            if (isLast) self.state = States.Done;
            else self.state = States.Streaming;
            break;
        case States.Streaming:
            self.errorEvent.emit(self, errors.RequestFrameState({
                attempted: 'call request',
                state: 'Streaming'
            }));
            break;
        case States.Done:
            self.errorEvent.emit(self, errors.RequestAlreadyDone({
                attempted: 'call request'
            }));
            break;
    }
};

TChannelOutRequest.prototype.sendCallRequestContFrame = function sendCallRequestContFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.errorEvent.emit(self, errors.RequestFrameState({
                attempted: 'call request continuation',
                state: 'Initial'
            }));
            break;
        case States.Streaming:
            self._sendCallRequestCont(args, isLast);
            if (isLast) self.state = States.Done;
            break;
        case States.Done:
            self.errorEvent.emit(self, errors.RequestAlreadyDone({
                attempted: 'call request continuation'
            }));
            break;
    }
};

TChannelOutRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;

    if (self.span) {
        self.span.name = String(arg1);
    }
    if (callback) self.hookupCallback(callback);
    self.sendCallRequestFrame([arg1, arg2, arg3], true);
    self.finishEvent.emit(self);
    return self;
};

TChannelOutRequest.prototype.hookupCallback = function hookupCallback(callback) {
    var self = this;
    self._callback = callback;
    return self;
};

TChannelOutRequest.prototype.checkTimeout = function checkTimeout() {
    var self = this;
    if (!self.timedOut) {
        var now = self.timers.now();
        var elapsed = now - self.start;
        if (elapsed > self.ttl) {
            self.end = now;
            self.timedOut = true;
            process.nextTick(function deferOutReqTimeoutErrorEmit() {
                self.errorEvent.emit(self, errors.TimeoutError({
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

module.exports = TChannelOutRequest;
