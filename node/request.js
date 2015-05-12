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

var assert = require('assert');
var EventEmitter = require('./lib/event_emitter');
var inherits = require('util').inherits;

var errors = require('./errors');

function TChannelRequest(channel, options) {
    options = options || {};
    assert(!options.streamed, "streaming request federation not implemented");
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.responseEvent = self.defineEvent('response');

    self.channel = channel;
    self.services = self.channel.services;
    self.logger = self.channel.logger;
    self.random = self.channel.random;
    self.timers = self.channel.timers;

    self.options = options;

    if (!self.options.retryFlags) {
        self.options.retryFlags = {
            never: false,
            onConnectionError: true,
            onTimeout: false
        };
    }

    self.triedRemoteAddrs = {};
    self.outReqs = [];
    self.timeout = self.options.timeout || TChannelRequest.defaultTimeout;
    self.limit = self.options.retryLimit || TChannelRequest.defaultRetryLimit;
    self.start = 0;
    self.end = 0;
    self.elapsed = 0;
    self.resendSanity = 0;
    self.trackPending = self.options.trackPending || false;

    self.serviceName = options.serviceName || '';
    self.headers = self.options.headers || {}; // so that as-foo can punch req.headers.X
    self.options.headers = self.headers; // for passing to peer.request(opts) later

    self.arg1 = null;
    self.arg2 = null;
    self.arg3 = null;

    self.err = null;
    self.res = null;
}

inherits(TChannelRequest, EventEmitter);


TChannelRequest.defaultRetryLimit = 5;
TChannelRequest.defaultTimeout = 5000;

TChannelRequest.prototype.type = 'tchannel.request';

TChannelRequest.prototype.emitError = function emitError(err) {
    var self = this;
    if (!self.end) self.end = self.timers.now();
    self.err = err;
    self.services.onRequestError(self);
    self.errorEvent.emit(self, err);
};

TChannelRequest.prototype.emitResponse = function emitResponse(res) {
    var self = this;
    if (!self.end) self.end = self.timers.now();
    self.res = res;
    self.services.onRequestResponse(self);
    self.responseEvent.emit(self, res);
};

TChannelRequest.prototype.hookupStreamCallback = function hookupCallback(callback) {
    throw new Error('not implemented');
};

TChannelRequest.prototype.hookupCallback = function hookupCallback(callback) {
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

        if (err.isErrorFrame) {
            self.channel.outboundCallsSystemErrorsStat.increment(1, {
                'target-service': self.serviceName,
                'service': self.headers.cn,
                // TODO should always be buffer
                'target-endpoint': String(self.arg1),
                'type': err.codeName
            });
        } else {
            self.channel.outboundCallsOperationalErrorsStat.increment(1, {
                'target-service': self.serviceName,
                'service': self.headers.cn,
                // TODO should always be buffer
                'target-endpoint': String(self.arg1),
                'type': err.type || 'unknown'
            });
        }

        emitLatency();

        callback(err, null, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        res.withArg23(function gotArg23(err, arg2, arg3) {
            if (res.ok) {
                self.channel.outboundCallsSuccessStat.increment(1, {
                    'target-service': self.serviceName,
                    'service': self.headers.cn,
                    // TODO should always be buffer
                    'target-endpoint': String(self.arg1)
                });
            } else {
                self.channel.outboundCallsAppErrorsStat.increment(1, {
                    'target-service': self.serviceName,
                    'service': self.headers.cn,
                    // TODO should always be buffer
                    'target-endpoint': String(self.arg1),
                    // TODO define transport header
                    // for application error type
                    'type': 'unknown'
                });
            }

            emitLatency();

            callback(err, res, arg2, arg3);
        });
    }

    function emitLatency() {
        var latency = self.end - self.start;
        self.channel.outboundCallsLatencyStat.add(latency, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': String(self.arg1)
        });
    }

    return self;
};

TChannelRequest.prototype.choosePeer = function choosePeer() {
    var self = this;
    return self.channel.peers.choosePeer(self, self.options);
};

TChannelRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;
    self.arg1 = arg1;
    self.arg2 = arg2;
    self.arg3 = arg3;
    if (callback) {
        self.hookupCallback(callback);
    }
    self.start = self.timers.now();
    self.resendSanity = self.limit + 1;

    self.services.onRequest(self);
    self.resend();
};

TChannelRequest.prototype.resend = function resend() {
    var self = this;

    if (self.channel.destroyed) return;

    if (self.trackPending && self.checkPending()) return;

    if (self.checkTimeout()) return;

    var peer = self.choosePeer();
    if (!peer) {
        if (self.outReqs.length) {
            var lastReq = self.outReqs[self.outReqs.length - 1];
            if (lastReq.err) {
                self.emitError(lastReq.err);
            } else {
                self.emitResponse(lastReq.res);
            }
        } else {
            self.emitError(errors.NoPeerAvailable());
        }
        return;
    }

    var perAttemptStart = self.timers.now();

    var opts = {};
    var keys = Object.keys(self.options);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        opts[key] = self.options[key];
    }
    opts.timeout = self.timeout - self.elapsed;

    var conn = peer.connect();
    if (!peer.isConnected() && conn.handler) {
        conn.on('identified', onIdentified);
        var timer = self.timers.setTimeout(onIdentifyTimeout, opts.timeout);
        return;
    } else {
        onIdentified();
    }

    function onIdentifyTimeout() {
        self.checkTimeout();
    }

    function onIdentified() {
        if (timer) {
            self.timers.clearTimeout(timer);
        }
        self.onIdentified(peer, opts, perAttemptStart);
    }
};

TChannelRequest.prototype.onIdentified = function onIdentified(peer, opts, perAttemptStart) {
    var self = this;
    var outReq = peer.request(opts);
    self.outReqs.push(outReq);

    if (self.outReqs.length === 1) {
        self.channel.outboundCallsSentStat.increment(1, {
            'target-service': outReq.serviceName,
            'service': outReq.headers.cn,
            // TODO should always be buffer
            'target-endpoint': String(self.arg1)
        });
    } else {
        self.channel.outboundCallsRetriesStat.increment(1, {
            'target-service': outReq.serviceName,
            'service': outReq.headers.cn,
            // TODO should always be buffer
            'target-endpoint': String(self.arg1),
            'retry-count': self.outReqs.length - 1
        });
    }

    self.triedRemoteAddrs[outReq.remoteAddr] = (self.triedRemoteAddrs[outReq.remoteAddr] || 0) + 1;
    outReq.responseEvent.on(onResponse);
    outReq.errorEvent.on(onError);
    outReq.send(self.arg1, self.arg2, self.arg3);

    function onError(err) {
        emitPerAttemptLatency();

        self.onSubreqError(err);
    }

    function onResponse(res) {
        emitPerAttemptLatency();

        self.onSubreqResponse(res);
    }

    function emitPerAttemptLatency() {
        var latency = self.timers.now() - perAttemptStart;

        self.channel.outboundCallsPerAttemptLatencyStat.add(latency, {
            'target-service': self.serviceName,
            'service': self.headers.cn,
            // TODO should always be buffer
            'target-endpoint': String(self.arg1),
            'peer': peer.hostPort,
            'retry-count': self.outReqs.length - 1
        });
    }
};

TChannelRequest.prototype.onSubreqError = function onSubreqError(err) {
    var self = this;
    if (self.checkTimeout(err)) return;
    if (self.shouldRetryError(err)) {
        self.deferResend();
    } else {
        self.emitError(err);
    }
};

TChannelRequest.prototype.onSubreqResponse = function onSubreqResponse(res) {
    var self = this;
    if (self.checkTimeout(null, res)) return;
    if (res.ok) {
        self.emitResponse(res);
    } else if (self.options.shouldApplicationRetry) {
        self.maybeAppRetry(res);
    } else {
        self.emitResponse(res);
    }
};

TChannelRequest.prototype.deferResend = function deferResend() {
    var self = this;
    if (--self.resendSanity <= 0) {
        self.emitError(new Error('TChannelRequest out of resend sanity'));
    } else {
        process.nextTick(doResend);
    }
    function doResend() {
        self.resend();
    }
};

TChannelRequest.prototype.checkPending = function checkPending() {
    var self = this;
    var err = self.services.errorIfExceedsMaxPending(self);
    if (err) {
        self.emitError(err);
        return true;
    }
    return false;
};

TChannelRequest.prototype.checkTimeout = function checkTimeout(err, res) {
    var self = this;
    var now = self.timers.now();
    self.elapsed = now - self.start;
    if (self.elapsed < self.timeout) return false;
    if (err) {
        if (!self.err) {
            self.emitError(err);
        }
    } else if (res) {
        if (!self.err && !self.res) {
            self.emitResponse(res);
        }
    } else if (!self.err) {
        self.emitError(errors.TimeoutError({
            start: self.start,
            elapsed: self.elapsed,
            timeout: self.timeout
        }));
    }
    return true;
};

TChannelRequest.prototype.shouldRetryError = function shouldRetryError(err) {
    var self = this;

    if (self.outReqs.length >= self.limit) {
        return false;
    }

    if (self.options.retryFlags.never) {
        return false;
    }

    if (err) {
        switch (err.type) {
            case 'tchannel.bad-request':
            case 'tchannel.canceled':
                return false;

            case 'tchannel.busy':
            case 'tchannel.declined':
                return true;

            case 'tchannel.timeout':
                return !!self.options.retryFlags.onTimeout;

            case 'tchannel.socket':
            case 'tchannel.socket-closed':
            case 'tchannel.network':
            case 'tchannel.protocol':
            case 'tchannel.unexpected':
                return !!self.options.retryFlags.onConnectionError;

            default:
                self.logger.error('unknown error type in request retry', {
                    error: err
                });
                return true;
        }
    }

    return false;
};

TChannelRequest.prototype.maybeAppRetry = function maybeAppRetry(res) {
    var self = this;
    self.options.shouldApplicationRetry(self, res, retry, done);

    function retry() {
        if (self.checkTimeout(null, res)) return;
        self.deferResend();
    }

    function done(err) {
        if (err) {
            self.emitError(err);
        } else {
            self.emitResponse(res);
        }
    }
};

module.exports = TChannelRequest;
