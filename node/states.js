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

var errors = require('./errors');

module.exports.HealthyState = HealthyState;
module.exports.UnhealthyState = UnhealthyState;

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

var symptoms = {
    'BadRequest': false, // not an indicator of bad health
    'Cancelled': false, // not an indicator of bad health
    'Timeout': true, // TODO throttle
    'Busy': true, // TODO throttle
    'Declined': true,
    'UnexpectedError': true,
    'NetworkError': true,
    'FatalProtocolError': true
};

// ## Healthy

function HealthyState(options) {
    var self = this;
    self.stateMachine = options.stateMachine;
    self.nextHandler = options.nextHandler;
    self.timers = options.timers;
    self.random = options.random;
    self.period = options.period || 1000; // ms
    self.start = self.timers.now();
    self.maxErrorRate = options.maxErrorRate || 0.5;
    self.okCount = 0;
    self.notOkCount = 0;
}

HealthyState.prototype.type = 'tchannel.healthy';

HealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Healthy %s ok %s err]', self.okCount, self.notOkCount);
};

HealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;
    var now = self.timers.now();
    // At the conclusion of a period
    if (now - self.start >= self.period) {
        var totalCount = self.okCount + self.notOkCount;
        // Transition to unhealthy state if the success rate dips below the
        // acceptable threshold.
        if (self.notOkCount / totalCount > self.maxErrorRate) {
            self.stateMachine.setState(UnhealthyState);
            return 0;
        }
        // Alternatley, start a new monitoring period.
        self.start = self.timers.now();
        self.okCount = 0;
        self.notOkCount = 0;
    }
    return self.stateMachine.shouldRequest();
};

HealthyState.prototype.onRequest = function onRequest(/* req */) {
};

HealthyState.prototype.onRequestResponse = function onRequestResponse(/* req */) {
    var self = this;
    self.okCount++;
};

HealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;
    var codeString = errors.classify(err);
    if (symptoms[codeString]) {
        self.notOkCount++;
    }
};

HealthyState.prototype.close = function close(callback) {
    callback(null);
};

// ## Unhealthy

function UnhealthyState(options) {
    var self = this;
    self.stateMachine = options.stateMachine;
    self.nextHandler = options.nextHandler;
    self.timers = options.timers;
    self.random = options.random;
    self.minResponseCount = options.probation || 5;
    self.period = options.period || 1000;
    self.start = self.timers.now();
    self.successCount = 0;
    self.triedThisPeriod = true;
}

UnhealthyState.prototype.type = 'tchannel.unhealthy';

UnhealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return format('[Unhealthy %s ok]', self.successCount);
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

    return self.nextHandler.shouldRequest();
};

UnhealthyState.prototype.onRequest = function onRequest(/* req */) {
    var self = this;
    self.triedThisPeriod = true;
};

UnhealthyState.prototype.onRequestResponse = function onRequestResponse(/* req */) {
    var self = this;
    self.successCount++;
    if (self.successCount > self.minResponseCount) {
        self.stateMachine.setState(HealthyState);
    }
};

UnhealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;
    var codeString = errors.classify(err);
    if (symptoms[codeString]) {
        self.successCount = 0;
    }
};

UnhealthyState.prototype.close = function close(callback) {
    callback(null);
};
