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

'use strict' 

var assert = require('assert');
var RequestHandler = require('./request-handler');

module.exports = Breaker;

/*
 * A Breaker is a request handler proxy that intercepts requests and monitors whether
 * the responses succeed or fail.
 * If the success rate drops below a threshold during a configured period, the
 * breaker stops forwarding requests and puts the handler on "probation".
 * Please forgive the mixed metaphor.
 * During probation, the breaker will only forward one request per period, and
 * multiple consecutive requests must succeed to reset the breaker.
 *
 * Options:
 *
 * - timers: Either real or mock timers object.
 * - period: The minimum duration of each probation window in miliseconds.
 *   A probation window concludes with the first request after this period
 *   elapses.
 * - tripRate: The minimum sucessful request rate to remain in a healthy state.
 *   If a probation window concludes with a lower sucess ratio, the breaker
 *   trips into the unhealthy state.
 * - probation: The number of probation periods with a successful request
 *   before a tripped breaker resets to a healthy state.
 */

function Breaker(opts, handler) {
    var self = this;

    assert(handler, 'breaker requires a handler second argument');
    assert(opts.timers, 'breaker requires timers');
    assert(opts.period, 'breaker requires a period in miliseconds');
    assert(opts.tripRate, 'breaker requires a tripRate');
    assert(opts.probation, 'breaker requires a probation period count');

    self.handler = RequestHandler(handler);
    self.healthyState = new HealthyState(self, opts);
    self.unhealthyState = new UnhealthyState(self, opts);
    self.state = self.healthyState;
    self.state.init();

    self._handleError = function handleError(codeString) {
        self.state = self.state.handleError(codeString);
    };

    self._handleFinish = function handleFinish() {
        self.state = self.state.handleFinish();
    };
}

// TODO validate these assumptions
// Whether each error code indicates that the endpoint may not be healthy
Breaker.prototype.indicators = {
    'Timeout': false,
    'Cancelled': false,
    'Busy': false,
    'Declined': false,
    'UnexpectedError': true,
    'BadRequest': false,
    'NetworkError': true,
    'FatalProtocolError': true
};

Breaker.prototype.trip = function trip() {
    var self = this;
    self.state = self.unhealthyState;
    self.state.init();
};

Breaker.prototype.reset = function reset() {
    var self = this;
    self.state = self.healthyState;
    self.state.init();
};

Breaker.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    if (self.state.shouldHandleRequest()) {
        self.handler.handleRequest(req, buildResponse);
        assert(req.res, 'handleRequest must create a res property for req');
        req.res.on('errored', self._handleError);
        req.res.on('finish', self._handleFinish);
    } else {
        req.res = buildResponse({streamed: false});
        req.res.sendError('UnexpectedError', 'Circuit broken'); // TODO check on appropriate error type
    }
};

function HealthyState(breaker, opts) {
    var self = this;
    self.breaker = breaker;
    self.timers = opts.timers;
    self.period = opts.period;
    self.tripRate = opts.tripRate;
    self.start = null;
    self.okCount = 0;
    self.notOkCount = 0;
}

HealthyState.prototype.name = 'healthy';

HealthyState.prototype.init = function () {
    var self = this;
    self.start = self.timers.now();
    self.okCount = 0;
    self.notOkCount = 0;
};

HealthyState.prototype.shouldHandleRequest = function shouldHandleRequest() {
    var self = this;
    var now = self.timers.now();
    if (now - self.start < self.period) {
        return true;
    }
    var totalCount = self.okCount + self.notOkCount;
    if (self.okCount / totalCount <= self.tripRate) {
        self.breaker.trip();
        self.init();
        return false;
    }
    self.init();
    return true;
};

HealthyState.prototype.handleError = function handleError(codeString) {
    var self = this;
    if (self.breaker.indicators[codeString]) {
        self.notOkCount++;
    }
};

HealthyState.prototype.handleFinish = function handleFinish() {
    var self = this;
    self.okCount++;
};

function UnhealthyState(breaker, opts) {
    var self = this;
    self.breaker = breaker;
    self.timers = opts.timers;
    self.probation = opts.probation;
    self.period = opts.period;
    self.start = null;
    self.tried = null;
    self.successCount = null;
}

UnhealthyState.prototype.name = 'unhealthy';

UnhealthyState.prototype.init = function () {
    var self = this;
    self.successCount = 0;
    self.start = self.timers.now();
    self.tried = true;
};

UnhealthyState.prototype.tick = function tick() {
    var self = this;
    self.start = self.timers.now();
    self.tried = false;
};

UnhealthyState.prototype.shouldHandleRequest = function shouldHandleRequest() {
    var self = this;

    // Allow one trial per period
    var now = self.timers.now();
    if (now - self.start >= self.period) {
        self.tick();
    }

    if (self.tried) {
        return false;
    }
    self.tried = true;
    return true;
};

UnhealthyState.prototype.handleError = function handleError(codeString) {
    var self = this;
    if (self.breaker.indicators[codeString]) {
        self.successCount = 0;
    }
};

UnhealthyState.prototype.handleFinish = function handleFinish() {
    var self = this;
    self.successCount++;
    if (self.successCount > self.probation) {
        self.breaker.reset();
    }
};
