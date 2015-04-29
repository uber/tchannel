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

    self.serviceName = options.serviceName || '';
    self.headers = self.options.headers || {}; // so that as-foo can punch req.headers.X
    self.options.headers = self.headers; // for passing to peer.request(opts) later

    self.arg1 = null;
    self.arg2 = null;
    self.arg3 = null;

    self.err = null;
    self.res = null;

    self.errorEvent.on(self.onError);
    self.responseEvent.on(self.onResponse);
}

inherits(TChannelRequest, EventEmitter);


TChannelRequest.defaultRetryLimit = 5;
TChannelRequest.defaultTimeout = 5000;

TChannelRequest.prototype.type = 'tchannel.request';

TChannelRequest.prototype.onError = function onError(err, self) {
    if (!self.end) self.end = self.timers.now();
    self.err = err;
};

TChannelRequest.prototype.onResponse = function onResponse(res, self) {
    if (!self.end) self.end = self.timers.now();
    self.res = res;
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
        callback(err, null, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        res.withArg23(function gotArg23(err, arg2, arg3) {
            callback(err, res, arg2, arg3);
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
    self.resend();
};

TChannelRequest.prototype.resend = function resend() {
    var self = this;

    if (self.checkTimeout()) return;

    var peer = self.choosePeer();
    if (!peer) {
        if (self.outReqs.length) {
            var lastReq = self.outReqs[self.outReqs.length - 1];
            if (lastReq.err) {
                self.errorEvent.emit(self, lastReq.err);
            } else {
                self.responseEvent.emit(self, lastReq.res);
            }
        } else {
            self.errorEvent.emit(self, errors.NoPeerAvailable());
        }
        return;
    }

    if (self.checkTimeout()) return;

    var opts = {};
    var keys = Object.keys(self.options);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        opts[key] = self.options[key];
    }
    opts.timeout = self.timeout - self.elapsed;
    var outReq = peer.request(opts);
    self.outReqs.push(outReq);

    self.triedRemoteAddrs[outReq.remoteAddr] = (self.triedRemoteAddrs[outReq.remoteAddr] || 0) + 1;
    outReq.responseEvent.on(onResponse);
    outReq.errorEvent.on(onError);
    outReq.send(self.arg1, self.arg2, self.arg3);

    function onError(err) {
        self.onSubreqError(err);
    }

    function onResponse(res) {
        // TODO: skip buffering if res.ok
        self.onSubreqResponse(res);
    }
};

TChannelRequest.prototype.onSubreqError = function onSubreqError(err) {
    var self = this;
    if (self.checkTimeout(err)) return;
    if (self.shouldRetry(err)) {
        self.deferResend();
    } else {
        self.errorEvent.emit(self, err);
    }
};

TChannelRequest.prototype.onSubreqResponse = function onSubreqResponse(res) {
    var self = this;
    if (self.checkTimeout(null, res)) return;
    res.withArg23(function onArg23(err, arg2, arg3) {
        if (self.checkTimeout(err, res)) return;
        if (self.shouldRetry(err, res, arg2, arg3)) {
            self.deferResend();
        } else if (err) {
            self.errorEvent.emit(self, err);
        } else {
            self.responseEvent.emit(self, res);
        }
    });
};

TChannelRequest.prototype.deferResend = function deferResend() {
    var self = this;
    if (--self.resendSanity <= 0) {
        self.errorEvent.emit(self, new Error('TChannelRequest out of resend sanity'));
    } else {
        process.nextTick(doResend);
    }
    function doResend() {
        self.resend();
    }
};

TChannelRequest.prototype.checkTimeout = function checkTimeout(err, res) {
    var self = this;
    var now = self.timers.now();
    self.elapsed = now - self.start;
    if (self.elapsed < self.timeout) return false;
    if (err) {
        if (!self.err) {
            self.errorEvent.emit(self, err);
        }
    } else if (res) {
        if (!self.err && !self.res) {
            self.responseEvent.emit(self, res);
        }
    } else if (!self.err) {
        self.errorEvent.emit(self, errors.TimeoutError({
            start: self.start,
            elapsed: self.elapsed,
            timeout: self.timeout
        }));
    }
    return true;
};

TChannelRequest.prototype.shouldRetry = function shouldRetry(err, res, arg2, arg3) {
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

    if (!res.ok && self.options.shouldApplicationRetry) {
        return self.options.shouldApplicationRetry(self, res, arg2, arg3);
    }

    return false;
};

module.exports = TChannelRequest;
