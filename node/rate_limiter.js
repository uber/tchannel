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

var DEFAULT_SERVICE_RPS_LIMIT = 5000;
var DEFAULT_TOTAL_RPS_LIMIT = 20000;
var DEFAULT_BUCKETS = 20;

function RateLimiter(options) {
    if (!(this instanceof RateLimiter)) {
        return new RateLimiter(options);
    }
    var self = this;

    self.timers = options.timers;

    self.buckets = options.buckets || DEFAULT_BUCKETS;
    assert(self.buckets > 0 && self.buckets <= 1000, 'counter buckets should between (0 1000]');

    self.defaultServiceRpsLimit = options.defaultServiceRpsLimit || DEFAULT_SERVICE_RPS_LIMIT;
    self.totalRpsLimit = options.totalRpsLimit || DEFAULT_TOTAL_RPS_LIMIT;
    self.rpsLimitForServiceName = options.rpsLimitForServiceName || Object.create(null);
    self.counters = Object.create(null);
    self.totalRequestCounter = self.createCounter(self.totalRpsLimit);

    self.refreshDelay = 1000 / self.buckets;
    self.refresh();

    self.destroyed = false;
}

RateLimiter.prototype.type = 'tchannel.hyperbahn.rate-limiting';

RateLimiter.prototype.refresh =
function refresh() {
    var self = this;

    self.udpateCounter(self.totalRequestCounter);

    var serviceNames = Object.keys(self.counters);
    for (var i = 0; i < serviceNames.length; i++) {
        self.udpateCounter(self.counters[serviceNames[i]]);
    }

    self.refreshTimer = self.timers.setTimeout(
        function refresh() {
            self.refresh();
        },
        self.refreshDelay
    );
};

RateLimiter.prototype.udpateCounter =
function udpateCounter(counter) {
    var self = this;

    // update the sliding window
    var next = (counter.index + 1) % self.buckets;
    if (counter.buckets[next]) {
        // offset the bucket being moved out
        counter.rps -= counter.buckets[next];
    }

    assert(counter.rps >= 0, 'rps should always be larger equal to 0');
    counter.index = next;
    counter.buckets[counter.index] = 0;
};

RateLimiter.prototype.createCounter =
function createCounter(rpsLimit) {
    var self = this;

    var counter = Object.create(null);
    counter.index = 0;
    counter.rps = 0;
    counter.buckets = [];
    counter.buckets.length = self.buckets;
    // counter.buckets is read/written in udpateCounter,
    // where read is always after write on a bucket.
    counter.buckets[0] = 0;
    counter.rpsLimit = rpsLimit;

    // if (serviceName === TOTAL_QPS) {
    //     counter.rpsLimit = self.totalRpsLimit;
    // } else {
    //     var limit = self.rpsLimitForServiceName[serviceName] || self.defaultServiceRpsLimit;
    //     counter.rpsLimit = limit / self.egressNodes.kValueFor(serviceName);
    // }

    return counter;
};

RateLimiter.prototype.removeServiceCounter =
function removeServiceCounter(serviceName) {
    var self = this;
    delete self.counters[serviceName];
};

RateLimiter.prototype.incrementServiceCounter =
function incrementServiceCounter(serviceName) {
    var self = this;
    var counter;

    assert(serviceName, 'incrementServiceCounter requires the serviceName');

    // if this is an existing service counter
    counter = self.counters[serviceName];
    // creating a new service counter
    if (!counter) {
        var limit = self.rpsLimitForServiceName[serviceName] || self.defaultServiceRpsLimit;
        counter = self.createCounter(limit);
        self.counters[serviceName] = counter;
    }

    // increment the service counter
    counter.buckets[counter.index] += 1;
    counter.rps += 1;
};

RateLimiter.prototype.incrementTotalCounter =
function incrementTotalCounter() {
    var self = this;
    self.totalRequestCounter.buckets[self.totalRequestCounter.index] += 1;
    self.totalRequestCounter.rps += 1;
};

RateLimiter.prototype.shouldRateLimitService =
function shouldRateLimitService(serviceName) {
    var self = this;
    var counter = self.counters[serviceName];
    assert(counter, 'cannot find counter for ' + serviceName);
    return counter.rps > counter.rpsLimit;
};

RateLimiter.prototype.shouldRateLimitTotalRequest =
function shouldRateLimitTotalRequest() {
    var self = this;
    return self.totalRequestCounter.rps > self.totalRequestCounter.rpsLimit;
};

RateLimiter.prototype.destroy =
function destroy() {
    var self = this;
    self.destroyed = true;
    self.timers.clearTimeout(self.refreshTimer);
};

module.exports = RateLimiter;
