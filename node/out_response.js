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
var stat = require('./lib/stat');
var inherits = require('util').inherits;

var errors = require('./errors');
var States = require('./reqres_states');

function TChannelOutResponse(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.spanEvent = self.defineEvent('span');
    self.finishEvent = self.defineEvent('finish');

    self.channel = options.channel;
    self.inreq = options.inreq;
    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.start = 0;
    self.end = 0;
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.tracing = options.tracing || null;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0;
    self.span = options.span || null;
    self.streamed = false;
    self._argstream = null;
    self.arg1 = null;
    self.arg2 = null;
    self.arg3 = null;

    self.codeString = null;
    self.message = null;
}

inherits(TChannelOutResponse, EventEmitter);

TChannelOutResponse.prototype.type = 'tchannel.outgoing-response';

TChannelOutResponse.prototype._sendCallResponse = function _sendCallResponse(args, isLast) {
    var self = this;
    throw errors.UnimplementedMethod({
        className: self.constructor.name,
        methodName: '_sendCallResponse'
    });
};

TChannelOutResponse.prototype._sendCallResponseCont = function _sendCallResponseCont(args, isLast) {
    var self = this;
    throw errors.UnimplementedMethod({
        className: self.constructor.name,
        methodName: '_sendCallResponseCont'
    });
};

TChannelOutResponse.prototype._sendError = function _sendError(codeString, message) {
    var self = this;
    throw errors.UnimplementedMethod({
        className: self.constructor.name,
        methodName: '_sendError'
    });
};

TChannelOutResponse.prototype.sendParts = function sendParts(parts, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendCallResponseFrame(parts, isLast);
            break;
        case States.Streaming:
            self.sendCallResponseContFrame(parts, isLast);
            break;
        case States.Done:
            self.errorEvent.emit(self, errors.ResponseFrameState({
                attempted: 'arg parts',
                state: 'Done'
            }));
            break;
        case States.Error:
            // TODO: log warn
            break;
        default:
            self.channel.logger.error('TChannelOutResponse is in a wrong state', {
                state: self.state
            });
            break;
    }
};

TChannelOutResponse.prototype.sendCallResponseFrame = function sendCallResponseFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.start = self.timers.now();
            self._sendCallResponse(args, isLast);
            if (self.span) {
                self.span.annotate('ss');
            }
            if (isLast) self.state = States.Done;
            else self.state = States.Streaming;
            break;
        case States.Streaming:
            self.errorEvent.emit(self, errors.ResponseFrameState({
                attempted: 'call response',
                state: 'Streaming'
            }));
            break;
        case States.Done:
        case States.Error:
            var arg2 = args[1] || '';
            var arg3 = args[2] || '';

            self.errorEvent.emit(self, errors.ResponseAlreadyDone({
                attempted: 'call response',
                state: self.state,
                method: 'sendCallResponseFrame',
                bufArg2: arg2.slice(0, 50),
                arg2: String(arg2).slice(0, 50),
                bufArg3: arg3.slice(0, 50),
                arg3: String(arg3).slice(0, 50)
            }));
    }
};

TChannelOutResponse.prototype.sendCallResponseContFrame = function sendCallResponseContFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.errorEvent.emit(self, errors.ResponseFrameState({
                attempted: 'call response continuation',
                state: 'Initial'
            }));
            break;
        case States.Streaming:
            self._sendCallResponseCont(args, isLast);
            if (isLast) self.state = States.Done;
            break;
        case States.Done:
        case States.Error:
            self.errorEvent.emit(self, errors.ResponseAlreadyDone({
                attempted: 'call response continuation',
                state: self.state,
                method: 'sendCallResponseContFrame'
            }));
    }
};

TChannelOutResponse.prototype.sendError = function sendError(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        self.errorEvent.emit(self, errors.ResponseAlreadyDone({
            attempted: 'send error frame: ' + codeString + ': ' + message,
            currentState: self.state,
            method: 'sendError',
            codeString: codeString,
            errMessage: message
        }));
    } else {
        if (self.span) {
            self.span.annotate('ss');
        }
        self.state = States.Error;

        self.codeString = codeString;
        self.message = message;
        self.channel.inboundCallsSystemErrorsStat.increment(1, {
            'calling-service': self.inreq.headers.cn,
            'service': self.inreq.serviceName,
            'endpoint': String(self.inreq.arg1),
            'type': self.codeString
        });
        self._sendError(codeString, message);
        self.emitFinish();
    }
};

TChannelOutResponse.prototype.emitFinish = function emitFinish() {
    var self = this;
    var now = self.timers.now();

    if (self.end) {
        self.logger.warn('out response double emitFinish', {
            end: self.end,
            now: now,
            serviceName: self.inreq.serviceName,
            cn: self.inreq.headers.cn,
            endpoint: String(self.inreq.arg1),
            codeString: self.codeString,
            errorMessage: self.message,
            remoteAddr: self.inreq.connection.socketRemoteAddr,
            state: self.state,

            isOk: self.ok
        });
        return;
    }

    self.end = now;

    var latency = self.end - self.inreq.start;

    self.channel.emitFastStat(self.channel.buildStat(
        'tchannel.inbound.calls.latency',
        'timing',
        latency,
        new stat.InboundCallsLatencyTags(
            self.inreq.headers.cn,
            self.inreq.serviceName,
            self.inreq.endpoint
        )
    ));

    if (self.span) {
        self.spanEvent.emit(self, self.span);
    }

    self.finishEvent.emit(self);
};

TChannelOutResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        self.errorEvent.emit(self, errors.ResponseAlreadyStarted({
            state: self.state,
            method: 'setOk',
            ok: ok
        }));
        return;
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
};

TChannelOutResponse.prototype.sendOk = function sendOk(res1, res2) {
    var self = this;
    self.setOk(true);
    self.send(res1, res2);
};

TChannelOutResponse.prototype.sendNotOk = function sendNotOk(res1, res2) {
    var self = this;
    if (self.state === States.Error) {
        self.logger.error('cannot send application error, already sent error frame', {
            res1: res1,
            res2: res2
        });
    } else {
        self.setOk(false);
        self.send(res1, res2);
    }
};

TChannelOutResponse.prototype.send = function send(res1, res2) {
    var self = this;

    /* send calls after finish() should be swallowed */
    if (self.end) {
        self.logger.warn('OutResponse called send() after end', {
            serviceName: self.inreq.serviceName,
            cn: self.inreq.headers.cn,
            endpoint: self.inreq.endpoint,
            remoteAddr: self.inreq.remoteAddr,

            end: self.end,
            codeString: self.codeString,
            errorMessage: self.message,
            isOk: self.ok,
            hasResponse: !!self.arg3,
            state: self.state
        });
        return;
    }

    self.arg2 = res1;
    self.arg3 = res2;

    if (self.ok) {
        self.channel.emitFastStat(self.channel.buildStat(
            'tchannel.inbound.calls.success',
            'counter',
            1,
            new stat.InboundCallsSuccessTags(
                self.inreq.headers.cn,
                self.inreq.serviceName,
                self.inreq.endpoint
            )
        ));
    } else {
        // TODO: add outResponse.setErrorType()
        self.channel.emitFastStat(self.channel.buildStat(
            'tchannel.inbound.calls.app-errors',
            'counter',
            1,
            new stat.InboundCallsAppErrorsTags(
                self.inreq.headers.cn,
                self.inreq.serviceName,
                self.inreq.endpoint,
                'unknown'
            )
        ));
    }

    self.sendCallResponseFrame([self.arg1, res1, res2], true);
    self.emitFinish();

    return self;
};

module.exports = TChannelOutResponse;
