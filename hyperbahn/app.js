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

var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var WrappedError = require('error/wrapped');
var assert = require('assert');
var process = require('process');

var setupEndpoints = require('./endpoints/');
var ApplicationClients = require('./clients/');

var ExitNode = require('./exit');
var EntryNode = require('./entry');

var DRAIN_DEADLINE_TIMEOUT = 30 * 1000;

var ApplicationClientsFailureError = WrappedError({
    type: 'autobahn.app-clients-failed',
    message: 'Application createClients failed: {origMessage}'
});

module.exports = Application;

function Application(config, opts) {
    if (!(this instanceof Application)) {
        return new Application(config, opts);
    }

    var self = this;
    EventEmitter.call(self);

    opts = opts || {};
    self.seedConfig = opts.seedConfig;
    self.seedClients = opts.clients || {};
    assert(opts.argv, 'opts.argv is required');

    self.clients = ApplicationClients({
        config: config,
        argv: opts.argv,
        seedClients: self.seedClients,
        processTitle: opts.processTitle,

        serviceReqDefaults: opts.serviceReqDefaults,
        servicePurgePeriod: opts.servicePurgePeriod,
        period: opts.period,
        maxErrorRate: opts.maxErrorRate,
        minRequests: opts.minRequests,
        probation: opts.probation,
        rateLimiterBuckets: opts.rateLimiterBuckets
    });
    self.services = null;
    self.logger = self.clients.logger;
    self.tchannel = self.clients.tchannel;
    self.drainDeadlineTimer = null;
    self.drainStart = null;
    self.drainEnd = null;

    self.isBootstrapped = false;

    // internal because its already deprecated
    self._controlServer = null;

    self.destroyed = false;
    // When we need to force destroy an app to test something,
    // we set this to true. Then we don't throw a 'double
    // destroy' error in destroy().
    self.forceDestroyed = false;
}

inherits(Application, EventEmitter);

Application.prototype.setupServices = function setupServices() {
    var self = this;

    self.services = {};
    self.services.exitNode = ExitNode(self.clients);
    self.services.entryNode = EntryNode(self.clients);

    setupEndpoints(self.clients, self.services);
};

Application.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    if (self.isBootstrapped) {
        throw new Error('double bootstrap');
    }
    self.isBootstrapped = true;

    self.setupServices();
    self.hookupSignals();
    self.clients.bootstrap(onClientsReady);

    function onClientsReady(err) {
        /* istanbul ignore next */
        if (err) {
            err = ApplicationClientsFailureError(err);
            return cb(err);
        }

        // necessary to expose app through repl
        self.clients.repl.setApp(self);

        cb(null);
    }

};

Application.prototype.hookupSignals =
function hookupSignals() {
    var self = this;

    process.on('SIGTERM', onSigTerm);
    process.on('SIGINT', onSigInt);

    function onSigTerm() {
        self.onSigTerm();
    }

    function onSigInt() {
        self.onSigInt();
    }
};

Application.prototype.extendLogInfo =
function extendLogInfo(info) {
    var self = this;

    info = self.tchannel.extendLogInfo(info);

    return info;
};

Application.prototype.onSigTerm =
function onSigTerm() {
    var self = this;

    if (self.tchannel.draining) {
        self.logger.info('got additional SIGTERM while draining', self.extendLogInfo({}));
    } else {
        self.startDrain();
    }
};

Application.prototype.startDrain =
function startDrain() {
    var self = this;

    self.drainStart = self.tchannel.timers.now();
    self.logger.info('got SIGTERM, draining application', self.extendLogInfo({}));
    self.tchannel.drain('shutting down due to SIGTERM',
                        isReqDrainExempt, drainedThenClose);
    self.drainDeadlineTimer = self.tchannel.timers.setTimeout(
        deadlineTimedOut, DRAIN_DEADLINE_TIMEOUT);

    function isReqDrainExempt(req) {
        return self.isReqDrainExempt(req);
    }

    function drainedThenClose() {
        self.drainedThenClose();
    }

    function deadlineTimedOut() {
        self.deadlineTimedOut();
    }
};

Application.prototype.onSigInt =
function onSigInt() {
    var self = this;

    if (self.tchannel.draining) {
        self.finishDrain('warn', 'got SIGINT, drain aborted');
    } else if (!self.destroyed) {
        self.logger.info('got SIGINT, destroying application', self.extendLogInfo({}));
        self.destroy();
    }
};

Application.prototype.deadlineTimedOut =
function deadlineTimedOut() {
    var self = this;

    self.finishDrain('warn', 'deadline timeout exceeded, closing now');
};

Application.prototype.drainedThenClose =
function drainedThenClose() {
    var self = this;

    if (!self.destroyed) {
        self.finishDrain('info', 'tchannel drained, destroying application');
    }
};

Application.prototype.isReqDrainExempt =
function isReqDrainExempt(req) {
    var self = this;

    // we only drain relay requests
    var chan = self.tchannel.subChannels[req.serviceName];
    var type = chan && chan.handler && chan.handler.type;
    if (type === 'tchannel.relay-handler') {
        return false;
    } else {
        return true;
    }
};

Application.prototype.finishDrain =
function finishDrain(level, mess, info) {
    var self = this;

    self.drainEnd = self.tchannel.timers.now();

    if (!info) {
        info = {};
    }
    var drainDuration = self.drainEnd - self.drainStart;
    self.clients.statsd.timing('server.drain-time', drainDuration);
    info.drainDurationMs = drainDuration;
    info = self.extendLogInfo(info);

    switch (level) {
        case 'info':
            self.logger.info(mess, info);
            break;
        case 'warn':
            self.logger.warn(mess, info);
            break;
        default:
            info.invalidLogLevel = level;
            self.logger.error(mess, info);
            break;
    }

    self.tchannel.timers.clearTimeout(self.drainDeadlineTimer);
    self.drainDeadlineTimer = null;

    self.destroy();
};

// TODO: remove, unecessary
Application.prototype.bootstrapAndListen =
function bootstrapAndListen(callback) {
    var self = this;

    self.bootstrap(callback);
};

Application.prototype.destroy = function destroy(opts) {
    var self = this;

    if (self.destroyed && !self.forceDestroyed) {
        throw new Error('double destroy');
    } else if (self.forceDestroyed) {
        // We were already destroyed
        return;
    }

    if (opts && opts.force) {
        self.forceDestroyed = true;
    }

    self.destroyed = true;

    self.clients.destroy();
};
