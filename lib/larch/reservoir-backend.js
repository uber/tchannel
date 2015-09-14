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
var util = require('util');
var timers = require('timers');
var NullStatsd = require('uber-statsd-client/null');

var BaseBackend = require('./base-backend');

module.exports = ReservoirBackend;

function ReservoirBackend(options) {
    if (!(this instanceof ReservoirBackend)) {
        return new ReservoirBackend(options);
    }

    var self = this;

    BaseBackend.call(self);

    self.backend = options.backend;
    assert(
        typeof self.backend === 'object' &&
        typeof self.backend.logMany === 'function',
        'options.backend must be object with `logMany` method'
    );

    self.statsd = options.statsd || NullStatsd();
    assert(
        typeof self.statsd === 'object' &&
        typeof self.statsd.gauge === 'function',
        'options.statsd must be object with `gauge` method'
    );

    self.size = options.size || 100;
    assert(
        typeof self.size === 'number' &&
        self.size >= 5 && self.size < 1000000000,
        'options.size must be number 5 >= n > 1000000000'
    );

    self.rangeRand = options.rangeRand || ReservoirBackend.rangeRand;
    assert(
        typeof self.rangeRand === 'function',
        'options.rangeRand must be function'
    );

    self.flushInterval = options.flushInterval || 50;
    assert(
        typeof self.flushInterval === 'number' &&
        self.flushInterval > 1 && self.flushInterval < 1000000,
        'options.flushInterval must be number 1 > n > 1000000'
    );

    self.timers = options.timers || timers;
    assert(
        typeof self.timers === 'object' &&
        typeof self.timers.setTimeout === 'function',
        'options.timers must be object with setTimeout function'
    );

    self.timer = null;
    self.count = 0;
    self.records = new Array(self.size);
    self.errors = [];
    self.dropCount = {};
}

util.inherits(ReservoirBackend, BaseBackend);

ReservoirBackend.rangeRand = function rand(lo, hi) {
    return Math.floor(Math.random() * (hi - lo) + lo);
};

ReservoirBackend.prototype.flush = function flush(records) {
    var self = this;

    var i;
    var keys = Object.keys(self.dropCount);
    for (i = 0; i < keys.length; i++) {
        self.statsd.count('larch.dropped.' + keys[i], self.dropCount[keys[i]]);
    }

    var copy = records.slice(0);
    self.backend.logMany(copy, onLoggingDone);

    function onLoggingDone(err) {
        // TODO: what to do when flush fails? Generate a log message?
        self.errors.push(err);
    }

    self.records.length = 0;
    self.count = 0;
};

ReservoirBackend.prototype.log = function log(record, cb) {
    var self = this;

    self.count += 1;

    if (self.records.length < self.size) {
        self.records.push(record);
    } else {
        var probability = self.rangeRand(0, self.count);
        if (probability < self.size) {
            // record drop for the record we're evicting
            self.recordDrop(self.records[probability].data.level);

            self.records[probability] = record;
        } else {
            // record drop for record we're dropping
            self.recordDrop(record.data.level);
        }
    }

    if (typeof cb === 'function') {
        cb();
    }
};

ReservoirBackend.prototype.recordDrop = function recordDrop(level) {
    var self = this;

    if (!self.dropCount[level]) {
        self.dropCount[level] = 1;
    } else {
        self.dropCount[level] += 1;
    }
};

ReservoirBackend.prototype.destroy = function destroy(cb) {
    var self = this;

    self.timers.clearTimeout(self.timer);
    self.backend.destroy(cb);
};

ReservoirBackend.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    assert(
        typeof cb === 'function',
        'bootstrap must be called with a callback'
    );

    self.timer = self.timers.setTimeout(onTimer, self.flushInterval);

    function onTimer() {
        self.flush(self.records);

        self.timer = self.timers.setTimeout(onTimer, self.flushInterval);
    }

    self.backend.bootstrap(cb);
};
