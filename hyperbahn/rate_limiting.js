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

var DEFAULT_SERVICE_QPS_LIMIT = 500;
var DEFAULT_TOTAL_QPS_LIMIT = 1000;
var DEFAULT_BUCKETS = 20;
var TOTAL_QPS = '~~TotalQPS++';

function RateLimiting(options) {
    if (!(this instanceof RateLimiting)) {
        return new RateLimiting(options);
    }
    var self = this;

    assert(options.serviceDispatchHandler, 'serviceDispatchHandler is required for RateLimiting');
    self.serviceDispatchHandler = options.serviceDispatchHandler;
    self.egressNodes = options.serviceDispatchHandler.egressNodes;
    self.timers = self.serviceDispatchHandler.channel.timers;

    self.qpsLimits = options.qpsLimits || Object.create(null);
    self.counters = Object.create(null);
    self.buckets = options.buckets || DEFAULT_BUCKETS;
    assert(self.buckets > 0 && self.buckets <= 1000, 'counter buckets should between (0 1000]');
    self.refreshDelay = 1000 / self.buckets;
    self.defaultServiceQpsLimit = options.defaultServiceQpsLimit || DEFAULT_SERVICE_QPS_LIMIT;
    self.totalQpsLimit = options.totalQpsLimit || DEFAULT_TOTAL_QPS_LIMIT;
    self.buckets = options.buckets || DEFAULT_BUCKETS;

    self.refresh();
}

RateLimiting.prototype.type = 'tchannel.hyperbahn.rate-limiting';

RateLimiting.prototype.refresh =
function refresh() {
    var self = this;

    // update hte sliding window
    var services = Object.keys(self.counters);
    for (var i = 0; i < services.length; i++) {
        var serviceName = services[i];
        var counter = self.counters[serviceName];
        var next = (counter.index + 1) % self.buckets;
        if (counter.buckets[next]) {
            // offset the bucket being moved out
            counter.qps -= counter.buckets[next];
        }
        assert(counter.qps >= 0, 'qps shouls always be larger equal to 0');
        counter.index = next;
        counter.buckets[counter.index] = 0;
        if (serviceName === TOTAL_QPS) {
            // total QPS limit never change
            continue;
        }
        var limit = self.qpsLimits[serviceName] || self.defaultServiceQpsLimit;
        counter.qpsLimit = limit / self.egressNodes.kValueFor(serviceName);
    }

    self.refreshTimer = self.timers.setTimeout(
        function refresh() {
            self.refresh();
        },
        self.refreshDelay
    );
};

RateLimiting.prototype.removeCounter =
function removeCounter(serviceName) {
    var self = this;
    delete self.counters[serviceName];
};

RateLimiting.prototype.isExitFor =
function isExitFor(serviceName) {
    var self = this;

    var chan = self.serviceDispatchHandler.channel.subChannels[serviceName];
    if (!chan) {
        return self.egressNodes.isExitFor(serviceName);
    }

    return chan.serviceProxyMode === 'exit';
};

RateLimiting.prototype.createCounter =
function createCounter(serviceName) {
    var self = this;

    var counter = Object.create(null);
    counter.index = 0;
    counter.qps = 0;
    counter.buckets = [];
    counter.buckets.length = self.buckets;
    counter.buckets[0] = 0;
    if (serviceName === TOTAL_QPS) {
        counter.qpsLimit = self.totalQpsLimit;
    } else {
        var limit = self.qpsLimits[serviceName] || self.defaultServiceQpsLimit;
        counter.qpsLimit = limit / self.egressNodes.kValueFor(serviceName);
    }

    return counter;
};

RateLimiting.prototype.incrementCounter =
function incrementCounter(serviceName) {
    var self = this;

    var counter = self.counters[serviceName];
    if (!counter) {
        counter = self.createCounter(serviceName);
        self.counters[serviceName] = counter;
    }

    counter.buckets[counter.index] += 1;
    counter.qps += 1;
};

RateLimiting.prototype.shouldRateLimit =
function shouldRateLimit(serviceName) {
    var self = this;

    var counter = self.counters[serviceName];
    assert(counter, 'cannot find counter for ' + serviceName);
    return counter.qps <= counter.qpsLimit ? 0 : counter.qpsLimit;
};

RateLimiting.prototype.handleRequest =
function handleRequest(req, buildRes) {
    var self = this;
    assert(req.serviceName, 'serviceName should not be empty for rate limiting.');

    if (req.serviceName === 'hyperbahn') {
        return false;
    }

    // check total QPS
    self.incrementCounter(TOTAL_QPS);
    var limit = self.shouldRateLimit(TOTAL_QPS);
    if (limit) {
        buildRes().sendError('Busy', 'hyperbahn node is rate limited by the total rate ' + limit + ' qps');
        return true;
    }

    // check QPS for serviceName
    if (!self.isExitFor(req.serviceName)) {
        return false;
    }

    self.incrementCounter(req.serviceName);
    limit = self.shouldRateLimit(req.serviceName);
    if (limit) {
        buildRes().sendError('Busy', req.serviceName + ' is rate limited by ' + limit + ' qps');
        return true;
    }

    return false;
};

RateLimiting.prototype.destroy =
function destroy() {
    var self = this;
    self.timers.clearTimeout(self.refreshTimer);
};

module.exports = RateLimiting;
