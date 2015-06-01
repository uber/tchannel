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
var extend = require('xtend');
var inherits = require('util').inherits;
var EventEmitter = require('./lib/event_emitter');

var errors = require('./errors');
var States = require('./reqres_states');
var Operations = require('./operations');

var DEFAULT_OUTGOING_REQ_TIMEOUT = 2000;
var CONNECTION_BASE_IDENTIFIER = 0;

function TChannelConnectionBase(channel, direction, remoteAddr) {
    assert(!channel.destroyed, 'refuse to create connection for destroyed channel');

    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.timedOutEvent = self.defineEvent('timedOut');
    self.spanEvent = self.defineEvent('span');

    self.closing = false;
    self.closeError = null;
    self.closeEvent = self.defineEvent('close');

    self.channel = channel;
    self.options = self.channel.options;
    self.logger = channel.logger;
    self.random = channel.random;
    self.timers = channel.timers;
    self.direction = direction;
    self.remoteAddr = remoteAddr;
    self.timer = null;
    self.remoteName = null; // filled in by identify message

    self.ops = new Operations({
        timers: self.timers,
        logger: self.logger,
        random: self.random,
        initTimeout: self.channel.initTimeout,
        timeoutCheckInterval: self.options.timeoutCheckInterval,
        timeoutFuzz: self.options.timeoutFuzz,
        connectionStalePeriod: self.options.connectionStalePeriod,
        connection: self
    });

    self.guid = ++CONNECTION_BASE_IDENTIFIER;

    self.tracer = self.channel.tracer;
    self.ops.startTimeoutTimer();
}
inherits(TChannelConnectionBase, EventEmitter);

TChannelConnectionBase.prototype.close = function close(callback) {
    var self = this;

    self.resetAll(errors.LocalSocketCloseError());
    callback();
};

// this connection is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state in case anybody
// stumbles across this object in a core dump.
TChannelConnectionBase.prototype.resetAll = function resetAll(err) {
    var self = this;

    self.ops.destroy();

    if (self.closing) return;
    self.closing = true;
    self.closeError = err;
    self.closeEvent.emit(self, err);

    var requests = self.ops.getRequests();
    var pending = self.ops.getPending();

    var inOpKeys = Object.keys(requests.in);
    var outOpKeys = Object.keys(requests.out);

    if (!err) {
        err = new Error('unknown connection reset'); // TODO typed error
    }

    var logInfo = {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: pending.in,
        outPending: pending.out
    };

    if (err.type && err.type.lastIndexOf('tchannel.socket', 0) < 0) {
        self.logger.warn('resetting connection', logInfo);
        self.errorEvent.emit(self, err);
    } else if (
        err.type !== 'tchannel.socket-closed' &&
        err.type !== 'tchannel.socket-local-closed'
    ) {
        logInfo.error = extend(err);
        logInfo.error.message = err.message;
        self.logger.info('resetting connection', logInfo);
    }

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        // TODO: support canceling pending handlers
        self.ops.removeReq(id);
        // TODO report or handle or log errors or something
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var req = requests.out[id];
        self.ops.removeReq(id);

        var info = {
            remoteAddr: self.remoteAddr,
            direction: self.direction,
            remoteName: self.remoteName,
            reqRemoteAddr: req.remoteAddr,
            serviceName: req.serviceName,
            outArg1: String(req.arg1)
        };
        if (err.type === 'tchannel.socket-local-closed') {
            err = errors.TChannelLocalResetError(err, info);
        } else {
            err = errors.TChannelConnectionResetError(err, info);
        }

        req.errorEvent.emit(req, err);
    });

    self.ops.clear();
};

// create a request
TChannelConnectionBase.prototype.request = function connBaseRequest(options) {
    var self = this;
    if (!options) options = {};
    options.remoteAddr = self.remoteAddr;

    options.channel = self.channel;

    // TODO: use this to protect against >4Mi outstanding messages edge case
    // (e.g. zombie operation bug, incredible throughput, or simply very long
    // timeout
    // assert(!self.requests.out[id], 'duplicate frame id in flight');
    // TODO: provide some sort of channel default for "service"
    // TODO: generate tracing if empty?
    // TODO: refactor callers
    options.checksumType = options.checksum;

    // TODO: better default, support for dynamic
    options.ttl = options.timeout || DEFAULT_OUTGOING_REQ_TIMEOUT;
    options.tracer = self.tracer;
    var req = self.buildOutRequest(options);

    return self.ops.addOutReq(req);
};

TChannelConnectionBase.prototype.handleCallRequest = function handleCallRequest(req) {
    var self = this;
    
    self.ops.addInReq(req);

    req.remoteAddr = self.remoteName;
    req.errorEvent.on(onReqError);

    process.nextTick(runHandler);

    function onReqError(err) {
        self.onReqError(req, err);
    }

    function runHandler() {
        self.runHandler(req);
    }
};

TChannelConnectionBase.prototype.onReqError = function onReqError(req, err) {
    var self = this;
    if (!req.res) self.buildResponse(req);
    if (err.type === 'tchannel.timeout' ||
        err.type === 'tchannel.request.timeout'
    ) {
        req.res.sendError('Timeout', err.message);
    } else {
        var errName = err.name || err.constructor.name;
        req.res.sendError('UnexpectedError', errName + ': ' + err.message);
    }
};

TChannelConnectionBase.prototype.runHandler = function runHandler(req) {
    var self = this;
    self.channel.handler.handleRequest(req, buildResponse);
    function buildResponse(options) {
        return self.buildResponse(req, options);
    }
};

TChannelConnectionBase.prototype.buildResponse = function buildResponse(req, options) {
    var self = this;
    var done = false;
    if (req.res && req.res.state !== States.Initial) {
        self.errorEvent.emit(self, errors.ResponseAlreadyStarted({
            state: req.res.state
        }));
    }
    req.res = self.buildOutResponse(req, options);
    req.res.errorEvent.on(onError);
    req.res.finishEvent.on(opDone);
    req.res.spanEvent.on(handleSpanFromRes);
    return req.res;

    function handleSpanFromRes(span) {
        self.spanEvent.emit(self, span);
    }

    function opDone() {
        if (done) return;
        done = true;
        self.onReqDone(req);
    }

    function onError(err) {
        self.onResponseError(err, req);
    }
};

function isStringOrBuffer(x) {
    return typeof x === 'string' || Buffer.isBuffer(x);
}

TChannelConnectionBase.prototype.onResponseError =
function onResponseError(err, req) {
    var self = this;

    var loggingOptions = {
        err: err,
        arg1: String(req.arg1),
        ok: req.res.ok,
        type: req.res.type,
        state: req.res.state === States.Done ? 'Done' :
            req.res.state === States.Error ? 'Error' :
            'Unknown'
    };

    if (req.res.state === States.Done) {
        var arg2 = isStringOrBuffer(req.res.arg2) ?
            req.res.arg2 : 'streaming';
        var arg3 = isStringOrBuffer(req.res.arg3) ?
            req.res.arg3 : 'streaming';

        loggingOptions.bufArg2 = arg2.slice(0, 50);
        loggingOptions.arg2 = String(arg2).slice(0, 50);
        loggingOptions.bufArg3 = arg3.slice(0, 50);
        loggingOptions.arg3 = String(arg3).slice(0, 50);
    } else if (req.res.state === States.Error) {
        loggingOptions.codeString = req.res.codeString;
        loggingOptions.errMessage = req.res.message;
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
            hasInReq: inreq !== undefined,
            id: req.id
        });
    }
};

module.exports = TChannelConnectionBase;
