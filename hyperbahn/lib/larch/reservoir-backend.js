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

var BaseBackend = require('./base-backend');

module.exports = ReservoirBackend;

function ReservoirBackend(options) {
    if (!(this instanceof ReservoirBackend)) {
        return new ReservoirBackend(options);
    }

    var self = this;

    BaseBackend.call(self);

    self.size = options.size || 500;
    assert(
        typeof self.size === 'number' &&
        self.size > 10 && self.size < 1000000000,
        'options.size must be number 10 > n > 1000000000'
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

    self.backend = options.backend;
    assert(
        typeof options.backend === 'object' &&
        typeof options.backend.logMany === 'function',
        'options.backend must be object with logMany function'
    );

    self.timer = null;
    self.count = 0;
    self.records = [];
}

util.inherits(ReservoirBackend, BaseBackend);

ReservoirBackend.rangeRand = function rand(lo, hi) {
    return Math.random() * (hi - lo) + lo;
};

ReservoirBackend.prototype.flush = function flush(records) {
    var self = this;

    var copy = records.slice(0);
    self.backend.logMany(copy);

    self.records.length = 0;
    self.count = 0;
};

ReservoirBackend.prototype.log = function log(record, cb) {
    var self = this;

    self.count += 1;

    if (self.records.length < self.size) {
        self.records.push(record);
    } else {
        var probability = self.rangeRand(1, self.count - 1);
        if (probability < self.records.length) {
            // evict and replace
            self.records[probability] = record;
        }
    }

    if (typeof cb === 'function') {
        cb();
    }
};

ReservoirBackend.prototype.destroy = function destroy(cb) {
    var self = this;

    self.timers.clearTimeout(self.timer);
    self.backend.destroy(cb);
};

ReservoirBackend.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    self.timer = self.timers.setTimeout(onTimer, self.flushInterval);

    function onTimer() {
        self.flush(self.records);

        self.timer = self.timers.setTimeout(onTimer, self.flushInterval);
    }

    self.backend.bootstrap(cb);
};
