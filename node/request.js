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

var errors = require('./errors');

var DEFAULT_RETRY_LIMIT = 5;

function TChannelRequest(channel, options) {
    options = options || {};
    var self = this;
    if (options.streamed) {
        throw new Error('streaming request federation not supported');
    }
    self.channel = channel;
    self.options = options;
    self.triedRemoteAddrs = {};
    self.outReqs = [];
    self.timeout = self.options.timeout;
    self.limit = self.options.retryLimit || DEFAULT_RETRY_LIMIT;
    self.start = 0;
    self.end = 0;
    self.elapsed = 0;

    self.headers = self.options.headers || {}; // so that as-foo can punch req.headers.X
    self.options.headers = self.headers; // for passing to peer.request(opts) later

    self.arg1 = null;
    self.arg2 = null;
    self.arg3 = null;
    self._callback = null;
    self._lastArg2 = null;
    self._lastArg3 = null;

    self.err = null;
    self.res = null;
}

TChannelRequest.prototype.type = 'tchannel.request';

TChannelRequest.prototype.choosePeer = function choosePeer() {
    var self = this;
    return self.channel.peers.choosePeer(self, self.options);
};

TChannelRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;
    self.arg1 = arg1;
    self.arg2 = arg2;
    self.arg3 = arg3;
    self._callback = callback;
    self.start = self.channel.timers.now();
    self.resend();
};

TChannelRequest.prototype.resend = function resend() {
    var self = this;

    var peer = self.choosePeer();
    if (!peer) {
        self.end = self.channel.timers.now();
        if (self.outReqs.length) {
            self._callback(self.err, self._lastArg2, self._lastArg3);
        } else {
            self.err = errors.NoPeerAvailable();
            self._callback(self.err, null, null);
        }
        return;
    }

    var outReq = peer.request(self.options);
    self.outReqs.push(outReq);

    self.triedRemoteAddrs[outReq.remoteAddr] = (self.triedRemoteAddrs[outReq.remoteAddr] || 0) + 1;
    outReq.send(self.arg1, self.arg2, self.arg3, outReqRedone);
    function outReqRedone(err, res, arg2, arg3) {
        self.onReqDone(err, res, arg2, arg3);
    }
};

TChannelRequest.prototype.onReqDone = function onReqDone(err, res, arg2, arg3) {
    var self = this;
    var now = self.channel.timers.now();
    self.elapsed = now - self.start;
    self.err = err;
    self.res = res;
    if (self.elapsed < self.timeout &&
        self.shouldRetry(err, res, arg2, arg3)) {
        self._lastArg2 = arg2;
        self._lastArg3 = arg3;
        process.nextTick(deferResend);
    } else {
        self.end = now;
        self._callback(err, res, arg2, arg3);
    }
    function deferResend() {
        self.resend();
    }
};

TChannelRequest.prototype.shouldRetry = function shouldRetry(err, res, arg2, arg3) {
    var self = this;

    if (self.outReqs.length >= self.retryLimit) {
        return false;
    }

    if (err) {
        switch (err.type) {
            case 'tchannel.bad-request':
            case 'tchannel.canceled':
                return false;

            case 'tchannel.socket':
            case 'tchannel.timeout':
            case 'tchannel.busy':
            case 'tchannel.declined':
            case 'tchannel.unexpected':
            case 'tchannel.protocol':
                return true;

            default:
                self.channel.logger.error('unknown error type in request retry', {
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
