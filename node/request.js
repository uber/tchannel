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

var DEFAULT_RETRY_LIMIT = 5;

function TChannelRequest(channel, options) {
    options = options || {};
    var self = this;
    if (options.streamed) {
        throw new Error('streaming request federation not supported');
    }
    self.channel = channel;
    self.options = options;
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
}

TChannelRequest.prototype.type = 'tchannel.request';

TChannelRequest.prototype.makeOutRequest = function makeOutRequest() {
    var self = this;
    var outReq = self.channel.peers.request(self.options);
    self.outReqs.push(outReq);
    return outReq;
};

TChannelRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;
    self.arg1 = arg1;
    self.arg2 = arg2;
    self.arg3 = arg3;
    self._callback = callback;
    var outReq = self.makeOutRequest();
    self.start = self.channel.timers.now();
    outReq.send(arg1, arg2, arg3, outReqDone);
    function outReqDone(err, res, arg2, arg3) {
        self.onReqDone(err, res, arg2, arg3);
    }
};

TChannelRequest.prototype.resend = function resend() {
    var self = this;
    var outReq = self.makeOutRequest();
    outReq.send(self.arg1, self.arg2, self.arg3, outReqRedone);
    function outReqRedone(err, res, arg2, arg3) {
        self.onReqDone(err, res, arg2, arg3);
    }
};

TChannelRequest.prototype.onReqDone = function onReqDone(err, res, arg2, arg3) {
    var self = this;
    var now = self.channel.timers.now();
    self.elapsed = now - self.start;
    if (self.elapsed < self.timeout &&
        self.shouldRetry(err, res, arg2, arg3)) {
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
