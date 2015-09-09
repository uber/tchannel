// Copyright (c) 2015 Uber Technologies, Inc.

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
var assert = require('assert');

function TChannelServiceNameHandler(options) {
    if (!(this instanceof TChannelServiceNameHandler)) {
        return new TChannelServiceNameHandler(options);
    }
    var self = this;

    assert(typeof options === 'object', 'options required');

    self.channel = options.channel;
    assert(typeof self.channel === 'object', 'expected options.tchannel to be object');

    self.isBusy = options.isBusy || null;
    if (self.isBusy) {
        assert(typeof self.isBusy === 'function', 'expected options.isBusy to be function');
    }
}

TChannelServiceNameHandler.prototype.type = 'tchannel.service-name-handler';

TChannelServiceNameHandler.prototype.handleLazily = function handleLazily(conn, reqFrame) {
    var self = this;

    var res = reqFrame.bodyRW.lazy.readService(reqFrame);
    if (res.err) {
        // TODO: stat?
        self.channel.logger.warn('failed to lazy read frame serviceName', conn.extendLogInfo({
            error: res.err
        }));
        // TODO: protocol error instead?
        self._sendLazyErrorFrame(conn, reqFrame, 'BadRequest', 'failed to read serviceName');
        return false;
    }

    var serviceName = res.value;
    if (!serviceName) {
        // TODO: reqFrame.extendLogInfo would be nice, especially if it added
        // things like callerName and arg1
        self.channel.logger.warn('missing service name in lazy frame', conn.extendLogInfo({}));
        self._sendLazyErrorFrame(conn, reqFrame, 'BadRequest', 'missing serviceName');
        return false;
    }

    var chan = self.channel.subChannels[serviceName];

    if (chan && chan.handler.handleLazily) {
        return chan.handler.handleLazily(conn, reqFrame);
    } else {
        return false;
    }
};

TChannelServiceNameHandler.prototype._sendLazyErrorFrame =
function _sendLazyErrorFrame(conn, reqFrame, codeString, message) {
    var fakeR = {
        id: reqFrame.id,
        tracing: null
    };
    var res = reqFrame.bodyRW.lazy.readService(reqFrame);
    if (!res.err) {
        fakeR.tracing = res.value;
    }
    conn.handler.sendErrorFrame(fakeR, codeString, message);
};

TChannelServiceNameHandler.prototype.handleRequest = function handleRequest(req, buildRes) {
    var self = this;

    if (self.isBusy) {
        var busyInfo = self.isBusy();
        if (busyInfo) {
            buildRes().sendError('Busy', busyInfo);
        }
    }

    if (!req.serviceName) {
        buildRes().sendError('BadRequest', 'no service name given');
        return;
    }
    var chan = self.channel.subChannels[req.serviceName];
    if (chan) {
        chan.handler.handleRequest(req, buildRes);
    } else {
        self.handleDefault(req, buildRes);
    }
};

TChannelServiceNameHandler.prototype.handleDefault = function handleDefault(req, buildRes) {
    var err = errors.NoServiceHandlerError({serviceName: req.serviceName});
    buildRes().sendError('BadRequest', err.message);
};

TChannelServiceNameHandler.prototype.register = function register() {
    throw errors.TopLevelRegisterError();
};

module.exports = TChannelServiceNameHandler;
