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

var DEFAULT_OUTGOING_REQ_TIMEOUT = 2000;

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

    // TODO: factor out an operation collection abstraction
    self.requests = {
        in: {},
        out: {}
    };
    self.pending = {
        in: 0,
        out: 0
    };

    self.lastTimeoutTime = 0;

    self.startTime = self.timers.now();
    self.startTimeoutTimer();
    self.tracer = self.channel.tracer;
}
inherits(TChannelConnectionBase, EventEmitter);

TChannelConnectionBase.prototype.close = function close(callback) {
    var self = this;
    self.resetAll(errors.SocketClosedError({reason: 'local close'}));
    callback();
};

// timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
//   base - fuzz/2 to base + fuzz/2
TChannelConnectionBase.prototype.getTimeoutDelay = function getTimeoutDelay() {
    var self = this;
    var base = self.options.timeoutCheckInterval;
    var fuzz = self.options.timeoutFuzz;
    if (fuzz) {
        fuzz = Math.round(Math.floor(self.random() * fuzz) - (fuzz / 2));
    }
    return base + fuzz;
};

TChannelConnectionBase.prototype.startTimeoutTimer = function startTimeoutTimer() {
    var self = this;
    self.timer = self.timers.setTimeout(function onChannelTimeout() {
        // TODO: worth it to clear the fired self.timer objcet?
        self.onTimeoutCheck();
    }, self.getTimeoutDelay());
};

TChannelConnectionBase.prototype.clearTimeoutTimer = function clearTimeoutTimer() {
    var self = this;
    if (self.timer) {
        self.timers.clearTimeout(self.timer);
        self.timer = null;
    }
};

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
TChannelConnectionBase.prototype.onTimeoutCheck = function onTimeoutCheck() {
    var self = this;
    if (self.closing) {
        return;
    }

    if (self.lastTimeoutTime) {
        self.timedOutEvent.emit(self);
        return;
    }

    var elapsed = self.timers.now() - self.startTime;
    if (!self.remoteName && elapsed >= self.channel.initTimeout) {
        self.timedOutEvent.emit(self, errors.TimeoutError({
            start: self.startTime,
            elapsed: elapsed,
            timeout: self.channel.initTimeout
        }));
    } else {
        self.checkTimeout(self.requests.out, 'out');
        self.checkTimeout(self.requests.in, 'in');
        self.startTimeoutTimer();
    }
};

TChannelConnectionBase.prototype.checkTimeout = function checkTimeout(ops, direction) {
    var self = this;
    var opKeys = Object.keys(ops);
    for (var i = 0; i < opKeys.length; i++) {
        var id = opKeys[i];
        var req = ops[id];
        if (req === undefined) {
            self.logger.warn('unexpected undefined request', {
                direction: direction,
                id: id
            });
        } else if (req.timedOut) {
            self.logger.warn('lingering timed-out request', {
                direction: direction,
                id: id
            });
            delete ops[id];
            self.pending[direction]--;
        } else if (req.checkTimeout()) {
            if (direction === 'out') {
                self.lastTimeoutTime = self.timers.now();
            // } else {
            //     req.res.sendError // XXX may need to build
            }
            delete ops[id];
            self.pending[direction]--;
        }
    }
};

// this connection is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state in case anybody
// stumbles across this object in a core dump.
TChannelConnectionBase.prototype.resetAll = function resetAll(err) {
    var self = this;

    self.clearTimeoutTimer();

    if (self.closing) return;
    self.closing = true;
    self.closeError = err;
    self.closeEvent.emit(self, err);

    var inOpKeys = Object.keys(self.requests.in);
    var outOpKeys = Object.keys(self.requests.out);

    if (!err) {
        err = new Error('unknown connection reset'); // TODO typed error
    }

    var logInfo = {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: self.pending.in,
        outPending: self.pending.out
    };

    if (err.type.lastIndexOf('tchannel.socket', 0) < 0) {
        self.logger.warn('resetting connection', logInfo);
        self.errorEvent.emit(self, err);
    } else if (err.type !== 'tchannel.socket-closed') {
        logInfo.error = extend(err);
        logInfo.error.message = err.message;
        self.logger.info('resetting connection', logInfo);
    }

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        // TODO: support canceling pending handlers
        delete self.requests.in[id];
        // TODO report or handle or log errors or something
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var req = self.requests.out[id];
        delete self.requests.out[id];
        err = errors.TChannelConnectionResetError(err);
        req.errorEvent.emit(req, err);
    });

    self.pending.in = 0;
    self.pending.out = 0;
};

TChannelConnectionBase.prototype.popOutReq = function popOutReq(id) {
    var self = this;
    var req = self.requests.out[id];
    if (!req) {
        // TODO else case. We should warn about an incoming response for an
        // operation we did not send out.  This could be because of a timeout
        // or could be because of a confused / corrupted server.
        return;
    }
    delete self.requests.out[id];
    self.pending.out--;
    return req;
};

// create a request
TChannelConnectionBase.prototype.request = function connBaseRequest(options) {
    var self = this;
    if (!options) options = {};
    options.remoteAddr = self.remoteAddr;

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

    return self._addOutReq(req);
};

TChannelConnectionBase.prototype._addOutReq = function _addOutReq(req) {
    var self = this;
    self.requests.out[req.id] = req;
    self.pending.out++;
    return req;
};

TChannelConnectionBase.prototype.handleCallRequest = function handleCallRequest(req) {
    var self = this;
    req.remoteAddr = self.remoteName;
    self.pending.in++;
    self.requests.in[req.id] = req;
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
    if (err.type === 'tchannel.timeout') {
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
};

TChannelConnectionBase.prototype.onReqDone = function onReqDone(req) {
    var self = this;
    // incoming req that timed out are already cleaned up
    if (self.requests.in[req.id] !== req && !req.timedOut) {
        self.logger.warn('mismatched onReqDone callback', {
            hostPort: self.channel.hostPort,
            hasInReq: self.requests.in[req.id] !== undefined,
            id: req.id
        });
    } else {
        delete self.requests.in[req.id];
        self.pending.in--;
    }
};

module.exports = TChannelConnectionBase;
