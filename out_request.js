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

module.exports = TChannelOutRequest;

var assert = require('assert');
var EventEmitter = require('./lib/event_emitter');
var stat = require('./lib/stat.js');
var inherits = require('util').inherits;
var parallel = require('run-parallel');

var errors = require('./errors');
var States = require('./reqres_states');

function TChannelOutRequest(id, options) {
    /*max-statements: [2, 50]*/
    var self = this;

    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.responseEvent = self.defineEvent('response');
    self.finishEvent = self.defineEvent('finish');

    assert(options.channel, 'channel required');
    assert(id, 'id is required');

    self.peerState = options.peerState || null;
    self.retryCount = options.retryCount || 0;
    self.channel = options.channel || null;
    self.logical = options.logical || false;
    self.parent = options.parent || null;
    self.hasNoParent = options.hasNoParent || false;

    self.remoteAddr = options.remoteAddr || '';
    self.timeout = options.timeout || 0;
    self.tracing = options.tracing || null;
    self.serviceName = options.serviceName || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.forwardTrace = options.forwardTrace || false;

    // All self requests have id 0
    self.operations = null;
    self.timeHeapHandle = null;
    self.id = id;
    self.state = States.Initial;
    self.start = 0;
    self.end = 0;
    self.streamed = false;
    self.arg1 = null;
    self.endpoint = '';
    self.arg2 = null;
    self.arg3 = null;
    self.span = null;
    self.err = null;
    self.res = null;
    self.timedOut = false;

    if (options.channel.tracer && !self.forwardTrace) {
        // new span with new ids
        self.setupTracing(options);
    }

    self.peerState.onRequest(self);
}

inherits(TChannelOutRequest, EventEmitter);

TChannelOutRequest.prototype.type = 'tchannel.outgoing-request';

TChannelOutRequest.prototype.setupTracing = function setupTracing(options) {
    var self = this;

    self.span = options.channel.tracer.setupNewSpan({
        outgoing: true,
        parentSpan: options.parent && options.parent.span,
        hasNoParent: options.hasNoParent,
        spanid: null,
        traceid: null,
        parentid: null,
        flags: options.trace ? 1 : 0,
        remoteName: self.remoteAddr,
        serviceName: self.serviceName,
        name: '' // fill this in later
    });

    self.tracing = self.span.getTracing();
};

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

TChannelOutRequest.prototype.emitPerAttemptErrorStat =
function emitPerAttemptErrorStat(err) {
    var self = this;

    if (err.isErrorFrame) {
        self.channel.outboundCallsPerAttemptSystemErrorsStat.increment(1, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': self.endpoint,
            'type': err.codeName,
            'retry-count': self.retryCount
        });
    } else {
        self.channel.outboundCallsPerAttemptOperationalErrorsStat.increment(1, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': self.endpoint,
            'type': err.type || 'unknown',
            'retry-count': self.retryCounts
        });
    }
};

TChannelOutRequest.prototype.emitErrorStat =
function emitErrorStat(err) {
    var self = this;

    if (err.isErrorFrame) {
        self.channel.outboundCallsSystemErrorsStat.increment(1, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': self.endpoint,
            'type': err.codeName
        });
    } else {
        self.channel.outboundCallsOperationalErrorsStat.increment(1, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': self.endpoint,
            'type': err.type || 'unknown'
        });
    }
};

TChannelOutRequest.prototype.emitResponseStat =
function emitResponseStat(res) {
    var self = this;

    if (res.ok) {
        emitOutboundCallsSuccess(self);
    } else {
        self.channel.emitFastStat(self.channel.buildStat(
            'tchannel.outbound.calls.app-errors',
            'counter',
            1,
            new stat.OutboundCallsAppErrorsTags(
                self.serviceName,
                self.headers.cn,
                self.endpoint,
                'unknown'
            )
        ));
    }
};

function emitOutboundCallsSuccess(request) {
    request.channel.emitFastStat(request.channel.buildStat(
        'tchannel.outbound.calls.success',
        'counter',
        1,
        new stat.OutboundCallsSuccessTags(
            request.serviceName,
            request.headers.cn,
            request.endpoint
        )
    ));
}



TChannelOutRequest.prototype.emitPerAttemptResponseStat =
function emitPerAttemptResponseStat(res) {
    var self = this;

    if (!res.ok) {
        self.channel.emitFastStat(self.channel.buildStat(
            'tchannel.outbound.calls.per-attempt.app-errors',
            'counter',
            1,
            new stat.OutboundCallsPerAttemptAppErrorsTags(
                self.serviceName,
                self.headers.cn,
                self.endpoint,
                'unknown',
                self.retryCount
            )
        ));
    // Only emit success if peer-to-peer request or relay
    } else if (self.logical === false) {
        emitOutboundCallsSuccess(self);
    }
};


TChannelOutRequest.prototype.emitPerAttemptLatency =
function emitPerAttemptLatency() {
    var self = this;

    var latency = self.end - self.start;

    self.channel.emitFastStat(self.channel.buildStat(
        'tchannel.outbound.calls.per-attempt-latency',
        'timing',
        latency,
        new stat.OutboundCallsPerAttemptLatencyTags(
            self.serviceName,
            self.headers.cn,
            self.endpoint,
            self.remoteAddr,
            self.retryCount
        )
    ));
};

TChannelOutRequest.prototype.emitLatency = function emitLatency() {
    var self = this;

    var latency = self.end - self.start;

    self.channel.emitFastStat(self.channel.buildStat(
        'tchannel.outbound.calls.latency',
        'timing',
        latency,
        new stat.OutboundCallsLatencyTags(
            self.serviceName,
            self.headers.cn,
            self.endpoint
        )
    ));
};

TChannelOutRequest.prototype.emitError = function emitError(err) {
    var self = this;

    if (!self.end) {
        self.end = self.channel.timers.now();
    }

    self.err = err;
    self.emitPerAttemptLatency();
    self.emitPerAttemptErrorStat(err);
    self.peerState.onRequestError(err);

    self.errorEvent.emit(self, err);
};

TChannelOutRequest.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;
    info.reqRemoteAddr = self.remoteAddr;
    info.serviceName = self.serviceName;
    info.outArg1 = String(self.arg1);
    return info;
};

TChannelOutRequest.prototype.emitResponse = function emitResponse(res) {
    var self = this;

    self.peerState.onRequestHealthy(self);
    if (!self.end) {
        self.end = self.channel.timers.now();
    }

    self.res = res;
    self.res.span = self.span;

    self.emitPerAttemptLatency();
    self.emitPerAttemptResponseStat(res);

    self.responseEvent.emit(self, res);
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
            // streaming request is cancelled
            self.emitError(errors.RequestFrameState({
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
            self.start = self.channel.timers.now();
            if (self.span) {
                self.span.annotate('cs');
            }
            self._sendCallRequest(args, isLast);
            if (isLast) self.state = States.Done;
            else self.state = States.Streaming;
            break;
        case States.Streaming:
            self.emitError(errors.RequestFrameState({
                attempted: 'call request',
                state: 'Streaming'
            }));
            break;
        case States.Done:
            self.emitError(errors.RequestAlreadyDone({
                attempted: 'call request'
            }));
            break;
    }
};

TChannelOutRequest.prototype.sendCallRequestContFrame = function sendCallRequestContFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.emitError(errors.RequestFrameState({
                attempted: 'call request continuation',
                state: 'Initial'
            }));
            break;
        case States.Streaming:
            self._sendCallRequestCont(args, isLast);
            if (isLast) self.state = States.Done;
            break;
        case States.Done:
            self.emitError(errors.RequestAlreadyDone({
                attempted: 'call request continuation'
            }));
            break;
    }
};

TChannelOutRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;

    self.endpoint = String(arg1);

    if (self.span) {
        self.span.name = self.endpoint;

        self.span.annotateBinary('as', self.headers.as);
        self.span.annotateBinary('cn', self.headers.cn);
    }

    if (self.logical === false && self.retryCount === 0) {
        self.emitOutboundCallsSent();
    }

    if (callback) {
        self.hookupCallback(callback);
    }

    self.arg1 = arg1;
    self.arg2 = arg2;
    self.arg3 = arg3;

    self.sendCallRequestFrame([arg1, arg2, arg3], true);
    self.finishEvent.emit(self);
    return self;
};

TChannelOutRequest.prototype.emitOutboundCallsSent =
function emitOutboundCallsSent() {
    var self = this;

    self.channel.emitFastStat(self.channel.buildStat(
        'tchannel.outbound.calls.sent',
        'counter',
        1,
        new stat.OutboundCallsSentTags(
            self.serviceName,
            self.headers.cn,
            self.endpoint
        )
    ));
};

TChannelOutRequest.prototype.hookupStreamCallback =
function hookupCallback(callback) {
    var self = this;
    var called = false;

    self.errorEvent.on(onError);
    self.responseEvent.on(onResponse);

    function onError(err) {
        if (called) return;
        called = true;
        callback(err, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        callback(null, self, res);
    }

    return self;
};

TChannelOutRequest.prototype.hookupCallback = function hookupCallback(callback) {
    var self = this;
    if (callback.canStream) {
        return self.hookupStreamCallback(callback);
    }
    var called = false;

    self.errorEvent.on(onError);
    self.responseEvent.on(onResponse);

    function onError(err) {
        if (called) return;
        called = true;
        callback(err, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        if (!res.streamed) {
            callback(null, res, res.arg2, res.arg3);
            return;
        }
        parallel({
            arg2: res.arg2.onValueReady,
            arg3: res.arg3.onValueReady
        }, compatCall);
        function compatCall(err, args) {
            callback(err, res, args.arg2, args.arg3);
        }
    }

    return self;
};

TChannelOutRequest.prototype.onTimeout = function onTimeout(now) {
    var self = this;

    if (!self.res || self.res.state === States.Initial) {
        self.end = now;
        self.timedOut = true;
        if (self.operations) {
            self.operations.checkLastTimeoutTime(now);
            self.operations.popOutReq(self.id);
        }
        process.nextTick(deferOutReqTimeoutErrorEmit);
    }

    function deferOutReqTimeoutErrorEmit() {
        var elapsed = now - self.start;
        self.emitError(errors.RequestTimeoutError({
            id: self.id,
            start: self.start,
            elapsed: elapsed,
            logical: self.logical,
            timeout: self.timeout
        }));
    }
};
