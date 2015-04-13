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

function TChannelRequest(channel, options) {
    options = options || {};
    var self = this;
    if (options.streamed) {
        throw new Error('streaming request federation not supported');
    }
    self.channel = channel;
    self.options = options;
    self.outReqs = [];
    self.start = 0;
    self.end = 0;

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

TChannelRequest.prototype.onReqDone = function onReqDone(err, res, arg2, arg3) {
    var self = this;
    var now = self.channel.timers.now();
    self.end = now;
    self._callback(err, res, arg2, arg3);
};

module.exports = TChannelRequest;
