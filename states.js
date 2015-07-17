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

var format = require('util').format;
var inherits = require('util').inherits;

var errors = require('./errors');

module.exports.StateOptions = StateOptions;
module.exports.HealthyState = HealthyState;
module.exports.UnhealthyState = UnhealthyState;
module.exports.LockedHealthyState = LockedHealthyState;
module.exports.LockedUnhealthyState = LockedUnhealthyState;

function StateOptions(stateMachine, options) {
    options = options || {};
    // for setState changes
    this.stateMachine = stateMachine;
    // for downstream shouldRequest, used differently in Peer and Circuit.
    this.nextHandler = options.nextHandler;
    // for mocking tests
    this.timers = options.timers;
    this.random = options.random;
    // the number of miliseconds that healthy and unhealthy requests are
    // tracked between state reevaluation.
    this.period = options.period;
    // when healthy, the minimum number of requests during a period to trigger
    // state reevaluation.
    this.minimumRequests = options.minimumRequests;
    // when healthy, the failure rate for a period that will trigger a
    // transition to unhealthy.
    this.maxErrorRate = options.maxErrorRate;
    // when unhealthy, allow one request per period. this is the number of
    // consecutive periods that must have 100% healthy responses to trigger a
    // switch back to healthy.
    this.probation = options.probation;
}

/*
 * Collectively, the health states receive additional options through the peer
 * options:
 * - maxErrorRate (error rate to go from healthy to unhealthy)
 * - minResponseCount (response count to go from unhealthy to healthy)
 * - TODO
 *
 * They also inherit:
 * - channel.timers
 * - channel.random
 */

function State(options) {
    var self = this;

    self.stateMachine = options.stateMachine;
    self.nextHandler = options.nextHandler;
    self.timers = options.timers;
    self.random = options.random;
}

State.prototype.onRequest = function onRequest(/* req */) {
};

State.prototype.onRequestHealthy = function onRequestHealthy() {
};

State.prototype.onRequestUnhealthy = function onRequestUnhealthy() {
};

State.prototype.onRequestError = function onRequestError(err) {
};

State.prototype.close = function close(callback) {
    callback(null);
};

function HealthyState(options) {
    var self = this;
    State.call(self, options);

    self.period = options.period || 1000; // ms
    self.start = self.timers.now();
    self.maxErrorRate = options.maxErrorRate || 0.5;
    self.healthyCount = 0;
    self.unhealthyCount = 0;
    self.totalRequests = 0;
    self.minRequests = typeof options.minRequests === 'number' ?
        options.minRequests : 5;
}

inherits(HealthyState, State);

HealthyState.prototype.type = 'tchannel.healthy';
HealthyState.prototype.healthy = true;
HealthyState.prototype.locked = false;

HealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Healthy %s healthy %s unhealthy]', self.healthyCount, self.unhealthyCount);
};

HealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;
    var now = self.timers.now();
    // At the conclusion of a period
    if (now - self.start >= self.period) {
        var totalCount = self.healthyCount + self.unhealthyCount;

        // Transition to unhealthy state if the healthy request rate dips below
        // the acceptable threshold.
        if (self.unhealthyCount / totalCount > self.maxErrorRate &&
            self.totalRequests > self.minRequests
        ) {
            self.stateMachine.setState(UnhealthyState);
            return 0;
        }
        // Alternatley, start a new monitoring period.
        self.start = self.timers.now();
        self.healthyCount = 0;
        self.unhealthyCount = 0;
    }
    return self.nextHandler.shouldRequest(req, options);
};

HealthyState.prototype.onRequestHealthy = function onRequestHealthy() {
    var self = this;
    self.healthyCount++;
    self.totalRequests++;
};

HealthyState.prototype.onRequestUnhealthy = function onRequestUnhealthy() {
    var self = this;
    self.totalRequests++;
    self.unhealthyCount++;
};

HealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;

    self.totalRequests++;
    var codeString = errors.classify(err);
    if (errors.isUnhealthy(codeString)) {
        self.unhealthyCount++;
    } else {
        self.healthyCount++;
    }
};

function UnhealthyState(options) {
    var self = this;
    State.call(self, options);

    self.minResponseCount = options.probation || 5;
    self.period = options.period || 1000;
    self.start = self.timers.now();
    self.healthyCount = 0;
    self.triedThisPeriod = true;
}

inherits(UnhealthyState, State);

UnhealthyState.prototype.type = 'tchannel.unhealthy';
UnhealthyState.prototype.healthy = false;
UnhealthyState.prototype.locked = false;

UnhealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Unhealthy %s consecutive healthy requests]', self.healthyCount);
};

UnhealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;

    // Start a new period if the previous has concluded
    var now = self.timers.now();
    if (now - self.start >= self.period) {
        self.start = self.timers.now();
        self.triedThisPeriod = false;
    }

    // Allow one trial per period
    if (self.triedThisPeriod) {
        return 0;
    }

    return self.nextHandler.shouldRequest(req, options);
};

UnhealthyState.prototype.onRequest = function onRequest(/* req */) {
    var self = this;
    self.triedThisPeriod = true;
};

UnhealthyState.prototype.onRequestHealthy = function onRequestHealthy() {
    var self = this;
    self.healthyCount++;
    if (self.healthyCount > self.minResponseCount) {
        self.stateMachine.setState(HealthyState);
    }
};

UnhealthyState.prototype.onRequestUnhealthy = function onRequestUnhealthy() {
    var self = this;
    self.healthyCount = 0;
};

UnhealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;
    var codeString = errors.classify(err);
    if (errors.isUnhealthy(codeString)) {
        self.healthyCount = 0;
    } else {
        self.onRequestHealthy();
    }
};

function LockedHealthyState(options) {
    var self = this;

    State.call(self, options);
}

inherits(LockedHealthyState, State);

LockedHealthyState.prototype.type = 'tchannel.healthy-locked';
LockedHealthyState.prototype.healthy = true;
LockedHealthyState.prototype.locked = true;

LockedHealthyState.prototype.toString = function lockedHealthyToString() {
    return '[Healthy state (locked)]';
};

LockedHealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;
    return self.nextHandler.shouldRequest(req, options);
};

function LockedUnhealthyState(options) {
    var self = this;

    State.call(self, options);
}

inherits(LockedUnhealthyState, State);

LockedUnhealthyState.prototype.type = 'tchannel.unhealthy-locked';
LockedUnhealthyState.prototype.healthy = false;
LockedUnhealthyState.prototype.locked = true;

LockedUnhealthyState.prototype.toString = function lockedUnhealthyToString() {
    return '[Unhealthy state (locked)]';
};

LockedUnhealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    return 0;
};
