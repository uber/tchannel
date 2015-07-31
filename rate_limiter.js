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

var DEFAULT_SERVICE_RPS_LIMIT = 100;
var DEFAULT_TOTAL_RPS_LIMIT = 1000;
var DEFAULT_BUCKET_NUMBER = 20;

function RateLimiterCounter(options) {
    if (!(this instanceof RateLimiterCounter)) {
        return new RateLimiterCounter(options);
    }

    var self = this;
    self.index = 0;
    self.rps = 0;
    self.numOfBuckets = options.numOfBuckets;
    self.buckets = [];

    // self.buckets is read/written in refresh,
    // where read is always after write on a bucket.
    self.buckets[0] = 0;
    self.rpsLimit = options.rpsLimit;
}

RateLimiterCounter.prototype.refresh =
function refresh() {
    var self = this;

    // update the sliding window
    var next = (self.index + 1) % self.numOfBuckets;
    if (self.buckets[next]) {
        // offset the bucket being moved out
        self.rps -= self.buckets[next];
    }

    assert(self.rps >= 0, 'rps should always be larger equal to 0');
    self.index = next;
    self.buckets[self.index] = 0;
};

RateLimiterCounter.prototype.increment =
function increment() {
    var self = this;
    self.buckets[self.index] += 1;
    self.rps += 1;
};

function RateLimiter(options) {
    if (!(this instanceof RateLimiter)) {
        return new RateLimiter(options);
    }
    var self = this;

    self.timers = options.timers;

    self.numOfBuckets = options.numOfBuckets || DEFAULT_BUCKET_NUMBER;
    assert(self.numOfBuckets > 0 && self.numOfBuckets <= 1000, 'counter numOfBuckets should between (0 1000]');

    self.defaultServiceRpsLimit = options.defaultServiceRpsLimit || DEFAULT_SERVICE_RPS_LIMIT;
    self.defaultTotalRpsLimit = DEFAULT_TOTAL_RPS_LIMIT;
    self.totalRpsLimit = options.totalRpsLimit;
    if (typeof self.totalRpsLimit !== 'number') {
        self.totalRpsLimit = self.defaultTotalRpsLimit;
    }
    self.rpsLimitForServiceName = options.rpsLimitForServiceName || Object.create(null);
    self.exemptServices = options.exemptServices || [];
    self.counters = Object.create(null);
    self.totalRequestCounter = RateLimiterCounter({
        numOfBuckets: self.numOfBuckets,
        rpsLimit: self.totalRpsLimit
    });

    self.refreshDelay = 1000 / self.numOfBuckets;
    self.refresh();

    self.destroyed = false;
}

RateLimiter.prototype.type = 'tchannel.hyperbahn.rate-limiting';

RateLimiter.prototype.refresh =
function refresh() {
    var self = this;

    self.totalRequestCounter.refresh();

    var serviceNames = Object.keys(self.counters);
    for (var i = 0; i < serviceNames.length; i++) {
        self.counters[serviceNames[i]].refresh();
    }

    self.refreshTimer = self.timers.setTimeout(
        function refresh() {
            self.refresh();
        },
        self.refreshDelay
    );
};

RateLimiter.prototype.removeServiceCounter =
function removeServiceCounter(serviceName) {
    var self = this;
    delete self.counters[serviceName];
};

RateLimiter.prototype.updateExemptServices =
function updateExemptServices(exemptServices) {
    var self = this;
    self.exemptServices = exemptServices;
};

RateLimiter.prototype.updateRpsLimitForAllServices =
function updateRpsLimitForAllServices(rpsLimitForServiceName) {
    var self = this;

    var name;
    var limit;

    // for removed or updated services
    var keys = Object.keys(self.rpsLimitForServiceName);
    for (var i = 0; i < keys.length; i++) {
        name = keys[i];
        limit = rpsLimitForServiceName[name];
        if (typeof limit !== 'number') {
            limit = 'default';
            delete self.rpsLimitForServiceName[name];
        }
        self.updateServiceLimit(name, limit);
    }

    // for new services
    keys = Object.keys(rpsLimitForServiceName);
    for (i = 0; i < keys.length; i++) {
        name = keys[i];
        limit = self.rpsLimitForServiceName[name];
        if (typeof limit !== 'number') {
            limit = rpsLimitForServiceName[name];
            self.updateServiceLimit(name, limit);
        }
    }
};

RateLimiter.prototype.updateServiceLimit =
function updateServiceLimit(serviceName, limit) {
    var self = this;

    if (limit === 'default') {
        delete self.rpsLimitForServiceName[serviceName];
        limit = self.defaultServiceRpsLimit;
    } else {
        self.rpsLimitForServiceName[serviceName] = limit;
    }

    // update counter
    var counter = self.counters[serviceName];
    if (counter) {
        counter.rpsLimit = limit;
    }
};

RateLimiter.prototype.updateTotalLimit =
function updateTotalLimit(limit) {
    var self = this;
    self.totalRpsLimit = limit;
    self.totalRequestCounter.rpsLimit = limit;
};

RateLimiter.prototype.createServiceCounter =
function createServiceCounter(serviceName) {
    var self = this;
    var counter;

    assert(serviceName, 'createServiceCounter requires the serviceName');

    if (self.exemptServices.indexOf(serviceName) !== -1) {
        return null;
    }

    // if this is an existing service counter
    counter = self.counters[serviceName];
    // creating a new service counter
    if (!counter) {
        var limit = self.rpsLimitForServiceName[serviceName];
        if (typeof limit !== 'number') {
            limit = self.defaultServiceRpsLimit;
        }
        counter = RateLimiterCounter({
            numOfBuckets: self.numOfBuckets,
            rpsLimit: limit
        });
        self.counters[serviceName] = counter;
    }

    return counter;
};

RateLimiter.prototype.incrementServiceCounter =
function incrementServiceCounter(serviceName) {
    var self = this;
    var counter = self.createServiceCounter(serviceName);

    if (counter) {
        // increment the service counter
        counter.increment();
    }
};

RateLimiter.prototype.incrementTotalCounter =
function incrementTotalCounter(serviceName) {
    var self = this;
    if (!serviceName || self.exemptServices.indexOf(serviceName) === -1) {
        self.totalRequestCounter.increment();
    }
};

RateLimiter.prototype.shouldRateLimitService =
function shouldRateLimitService(serviceName) {
    var self = this;
    if (self.exemptServices.indexOf(serviceName) !== -1) {
        return false;
    }
    var counter = self.counters[serviceName];
    assert(counter, 'cannot find counter for ' + serviceName);
    return counter.rps > counter.rpsLimit;
};

RateLimiter.prototype.shouldRateLimitTotalRequest =
function shouldRateLimitTotalRequest(serviceName) {
    var self = this;
    if (!serviceName || self.exemptServices.indexOf(serviceName) === -1) {
        return self.totalRequestCounter.rps > self.totalRequestCounter.rpsLimit;
    } else {
        return false;
    }
};

RateLimiter.prototype.destroy =
function destroy() {
    var self = this;
    self.destroyed = true;
    self.timers.clearTimeout(self.refreshTimer);
};

module.exports = RateLimiter;
