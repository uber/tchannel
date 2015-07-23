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
    this.timeHeap = options.timeHeap;
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
    self.timeHeap = options.timeHeap;
    self.random = options.random;
}

State.prototype.onDeactivate = function onDeactivate() {
};

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

State.prototype.invalidate = function invalidate() {
    var self = this;

    if (self.stateMachine.invalidateScore) {
        self.stateMachine.invalidateScore();
    }
};

State.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;

    var now = self.timers.now();
    if (self.willCallNextHandler(now)) {
        return self.nextHandler.shouldRequest(req, options);
    } else if (self.stateMachine.state !== self) {
        return self.stateMachine.state.shouldRequest(req, options);
    } else {
        return 0;
    }
};

function PeriodicState(options) {
    var self = this;
    State.call(self, options);

    self.period = options.period || 1000; // ms
    self.start = 0;
    self.timeout = 0;
    self.periodTimer = null;

    self.startNewPeriod(self.timers.now());
}
inherits(PeriodicState, State);

PeriodicState.prototype.startNewPeriod = function startNewPeriod(now) {
    var self = this;

    self.start = now;
    if (self.onNewPeriod()) {
        self.setPeriodTimer(self.period, now);
    }
};

PeriodicState.prototype.onDeactivate = function onDeactivate() {
    var self = this;

    if (self.periodTimer) {
        self.periodTimer.cancel();
        self.periodTimer = null;
    }
};

PeriodicState.prototype.setPeriodTimer = function setPeriodTimer(timeout, now) {
    var self = this;

    if (self.periodTimer) {
        self.periodTimer.cancel();
        self.periodTimer = null;
    }

    self.timeout = timeout;
    self.periodTimer = self.timeHeap.update(self, now);
};

PeriodicState.prototype.onTimeout = function onTimeout() {
    var self = this;

    var now = self.timers.now();
    self.checkPeriod(true, now);
};

PeriodicState.prototype.checkPeriod = function checkPeriod(inTimeout, now) {
    var self = this;

    var elapsed = now - self.start;
    var remain = self.period - elapsed;
    if (remain <= 0) {
        self.startNewPeriod(now);
        return true;
    } else if (inTimeout) {
        self.setPeriodTimer(remain, now);
    }
    return false;
};

PeriodicState.prototype.willCallNextHandler = function willCallNextHandler(now) {
    var self = this;

    self.checkPeriod(false, now);
};

function HealthyState(options) {
    var self = this;
    PeriodicState.call(self, options);

    self.maxErrorRate = options.maxErrorRate || 0.5;
    self.healthyCount = 0;
    self.unhealthyCount = 0;
    self.totalRequests = 0;
    self.minRequests = typeof options.minRequests === 'number' ?
        options.minRequests : 5;
}

inherits(HealthyState, PeriodicState);

HealthyState.prototype.type = 'tchannel.healthy';
HealthyState.prototype.healthy = true;
HealthyState.prototype.locked = false;

HealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Healthy %s healthy %s unhealthy]', self.healthyCount, self.unhealthyCount);
};

HealthyState.prototype.willCallNextHandler = function willCallNextHandler(now) {
    var self = this;

    self.checkPeriod(false, now);

    // active unless .onNewPeriod transitioned
    return self.stateMachine.state === self;
};

HealthyState.prototype.onNewPeriod = function onNewPeriod(now) {
    var self = this;

    var totalCount = self.healthyCount + self.unhealthyCount;

    // TODO: could store on self for introspection, maybe call it
    // "lastPeriodErrorRate"?; we could even keep a fixed size sample of error
    // rates from periods and choose based on their differences (discrete
    // derivative)...
    var errorRate = self.unhealthyCount / totalCount;

    if (errorRate > self.maxErrorRate &&
        self.totalRequests > self.minRequests) {
        // Transition to unhealthy state if the healthy request rate dips below
        // the acceptable threshold.
        self.stateMachine.setState(UnhealthyState);
        // TODO: useful to mark self dead somehow? for now we're just using "am
        // I still the current state" logic coupled to the consuming
        // stateMachine in .willCallNextHandler
    } else {
        // okay last period, reset counts for the new period
        self.healthyCount = 0;
        self.unhealthyCount = 0;
    }

    return true;
};

HealthyState.prototype.onRequest = function onRequest(/* req */) {
    var self = this;

    self.invalidate();
};

HealthyState.prototype.onRequestHealthy = function onRequestHealthy() {
    var self = this;
    self.healthyCount++;
    self.totalRequests++;
    self.invalidate();
};

HealthyState.prototype.onRequestUnhealthy = function onRequestUnhealthy() {
    var self = this;
    self.totalRequests++;
    self.unhealthyCount++;
    if (!self.checkPeriod(false, self.timers.now())) {
        self.invalidate();
    }
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
    if (!self.checkPeriod(false, self.timers.now())) {
        self.invalidate();
    }
};

function UnhealthyState(options) {
    var self = this;
    PeriodicState.call(self, options);

    self.minResponseCount = options.probation || 5;
    self.healthyCount = 0;
    self.triedThisPeriod = true;
}

inherits(UnhealthyState, PeriodicState);

UnhealthyState.prototype.type = 'tchannel.unhealthy';
UnhealthyState.prototype.healthy = false;
UnhealthyState.prototype.locked = false;

UnhealthyState.prototype.onNewPeriod = function onNewPeriod(now) {
    var self = this;

    if (self.healthyCount >= self.minResponseCount) {
        self.stateMachine.setState(HealthyState);
        return;
    }

    var triedLastPeriod = self.triedThisPeriod;
    self.triedThisPeriod = false;

    if (triedLastPeriod) {
        // score only changes if we had gone back to "closed" state, otherwise
        // we simply are remaining "open" for a single probe
        self.invalidate();
    }

    return true;
};

UnhealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Unhealthy %s consecutive healthy requests]', self.healthyCount);
};

UnhealthyState.prototype.willCallNextHandler = function willCallNextHandler(now) {
    var self = this;

    self.checkPeriod(false, now);

    // if .checkPeriod transitioned us back to healthy, we're done
    if (self.stateMachine.state !== self) {
        return false;
    }

    // Allow one trial per period
    return !self.triedThisPeriod;
};

UnhealthyState.prototype.onRequest = function onRequest(/* req */) {
    var self = this;

    self.triedThisPeriod = true;
    if (!self.checkPeriod(false, self.timers.now())) {
        self.invalidate();
    }
};

UnhealthyState.prototype.onRequestHealthy = function onRequestHealthy() {
    var self = this;

    self.healthyCount++;
    if (self.healthyCount > self.minResponseCount) {
        self.stateMachine.setState(HealthyState);
    } else {
        self.invalidate();
    }
};

UnhealthyState.prototype.onRequestUnhealthy = function onRequestUnhealthy() {
    var self = this;

    self.healthyCount = 0;
};

UnhealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;

    var codeString = errors.classify(err);
    if (!errors.isUnhealthy(codeString)) {
        self.onRequestHealthy();
        return;
    }

    self.healthyCount = 0;
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

LockedHealthyState.prototype.willCallNextHandler = function willCallNextHandler() {
    return true;
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

LockedUnhealthyState.prototype.willCallNextHandler = function willCallNextHandler() {
    return false;
};

LockedUnhealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    return 0;
};
