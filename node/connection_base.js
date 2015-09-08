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
var inherits = require('util').inherits;
var EventEmitter = require('./lib/event_emitter');
var stat = require('./lib/stat.js');

var errors = require('./errors');
var States = require('./reqres_states');
var Operations = require('./operations');

var CONNECTION_BASE_IDENTIFIER = 0;

function TChannelConnectionBase(channel, direction, socketRemoteAddr) {
    assert(!channel.destroyed, 'refuse to create connection for destroyed channel');

    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.timedOutEvent = self.defineEvent('timedOut');
    self.pingResponseEvent = self.defineEvent('pingResonse');

    self.closing = false;
    self.closeError = null;
    self.closeEvent = self.defineEvent('close');

    self.channel = channel;
    self.options = self.channel.options;
    self.logger = channel.logger;
    self.random = channel.random;
    self.timers = channel.timers;
    self.direction = direction;
    self.socketRemoteAddr = socketRemoteAddr;
    self.remoteName = null; // filled in by identify message

    self.ops = new Operations({
        timers: self.timers,
        logger: self.logger,
        random: self.random,
        initTimeout: self.channel.initTimeout,
        connectionStalePeriod: self.options.connectionStalePeriod,
        connection: self
    });

    self.guid = ++CONNECTION_BASE_IDENTIFIER + '~';

    self.tracer = self.channel.tracer;
}
inherits(TChannelConnectionBase, EventEmitter);

TChannelConnectionBase.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    info.hostPort = self.channel.hostPort;
    info.socketRemoteAddr = self.socketRemoteAddr;
    info.remoteName = self.remoteName;
    info.connClosing = self.closing;

    return info;
};

TChannelConnectionBase.prototype.setLazyHandling = function setLazyHandling() {
    // noop
};

// create a request
TChannelConnectionBase.prototype.request =
function connBaseRequest(options) {
    var self = this;

    assert(self.remoteName, 'cannot make request unless identified');
    options.remoteAddr = self.remoteName;

    // TODO: use this to protect against >4Mi outstanding messages edge case
    // (e.g. zombie operation bug, incredible throughput, or simply very long
    // timeout
    // assert(!self.requests.out[id], 'duplicate frame id in flight');

    // options.checksumType = options.checksum;

    var req = self.buildOutRequest(options);
    self.ops.addOutReq(req);
    req.peer.invalidateScore();
    return req;
};

TChannelConnectionBase.prototype.handleCallRequest = function handleCallRequest(req) {
    var self = this;

    req.remoteAddr = self.remoteName;
    self.ops.addInReq(req);

    process.nextTick(runHandler);

    function runHandler() {
        self.runHandler(req);
    }
};

TChannelConnectionBase.prototype.runHandler = function runHandler(req) {
    var self = this;

    self.channel.emitFastStat(self.channel.buildStat(
        'tchannel.inbound.calls.recvd',
        'counter',
        1,
        new stat.InboundCallsRecvdTags(
            req.headers.cn,
            req.serviceName,
            req.endpoint
        )
    ));

    self.channel.handler.handleRequest(req, buildResponse);
    function buildResponse(options) {
        return self.buildResponse(req, options || {});
    }
};

TChannelConnectionBase.prototype.buildResponse =
function buildResponse(req, options) {
    var self = this;

    if (req.res && req.res.state !== States.Initial) {
        req.errorEvent.emit(req, errors.ResponseAlreadyStarted({
            state: req.res.state,
            reason: 'buildResponse called twice',
            codeString: req.res.codeString,
            responseMessage: req.res.message
        }));
        return req.res;
    }

    return self._buildResponse(req, options);
};

TChannelConnectionBase.prototype._buildResponse =
function _buildResponse(req, options) {
    var self = this;

    options.channel = self.channel;
    options.inreq = req;

    // TODO give this options a well defined type
    req.res = self.buildOutResponse(req, options);

    req.res.errorEvent.on(onError);
    req.res.finishEvent.on(opDone);

    if (!req.forwardTrace) {
        self.captureResponseSpans(req.res);
    }

    return req.res;

    function opDone() {
        self.onReqDone(req);
    }

    function onError(err) {
        self.onResponseError(err, req);
    }
};

TChannelConnectionBase.prototype.captureResponseSpans =
function captureResponseSpans(res) {
    var self = this;

    res.spanEvent.on(handleSpanFromRes);

    function handleSpanFromRes(span) {
        self.handleSpanFromRes(span);
    }
};

function isStringOrBuffer(x) {
    return typeof x === 'string' || Buffer.isBuffer(x);
}

TChannelConnectionBase.prototype.handleSpanFromRes =
function handleSpanFromRes(span) {
    var self = this;

    self.channel.tracer.report(span);
};

TChannelConnectionBase.prototype.onResponseError =
function onResponseError(err, req) {
    var self = this;

    // don't log if we get further timeout errors for already timed out response
    if (req.timedOut && errors.classify(err) === 'Timeout') {
        return;
    }

    var loggingOptions = req.extendLogInfo(req.res.extendLogInfo({
        error: err
    }));

    if (req.res.state === States.Done) {
        var arg2 = isStringOrBuffer(req.res.arg2) ?
            req.res.arg2 : 'streaming';
        var arg3 = isStringOrBuffer(req.res.arg3) ?
            req.res.arg3 : 'streaming';

        loggingOptions.bufArg2 = arg2.slice(0, 50);
        loggingOptions.arg2 = String(arg2).slice(0, 50);
        loggingOptions.bufArg3 = arg3.slice(0, 50);
        loggingOptions.arg3 = String(arg3).slice(0, 50);
    }

    if ((err.type === 'tchannel.response-already-started' ||
        err.type === 'tchannel.response-already-done') &&
        req.timedOut
    ) {
        self.logger.info(
            'error for timed out outgoing response', loggingOptions
        );
    } else {
        self.logger.error(
            'outgoing response has an error', loggingOptions
        );
    }
};

TChannelConnectionBase.prototype.onReqDone = function onReqDone(req) {
    var self = this;

    var inreq = self.ops.popInReq(req.id);

    // incoming req that timed out are already cleaned up
    if (inreq !== req && !req.timedOut) {
        self.logger.warn('mismatched onReqDone callback', {
            hostPort: self.channel.hostPort,
            hasInReq: !!inreq,
            id: req.id
        });
    }
};

module.exports = TChannelConnectionBase;
