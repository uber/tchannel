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

var inherits = require('util').inherits;
var EventEmitter = require('./event_emitter');
var BaseStat = require('./stat').BaseStat;

// This is an interface that exists only to explicitly declare the stats we are
// tracking and avoid bugs due to mis-spelled names and types.

function StatEmitter() {
    var self = this;
    EventEmitter.call(self);
    self.statEvent = self.defineEvent('stat');
}

inherits(StatEmitter, EventEmitter);

// These methods are intended to be used in the constructor to declare stats.
StatEmitter.prototype.defineCounter = function defineCounter(name) {
    var self = this;
    return new Counter(name, self);
};

StatEmitter.prototype.defineGauge = function defineGauge(name) {
    var self = this;
    return new Gauge(name, self);
};

StatEmitter.prototype.defineTiming = function defineTiming(name) {
    var self = this;
    return new Timing(name, self);
};

// May be overridden to add tags to the stat object.
StatEmitter.prototype.emitStat = function emitStat(stat) {
    var self = this;
    self.statEvent.emit(self.emitter, stat);
};

function emitStat(value, tags) {
    /*jshint validthis: true */
    var self = this;
    var stat = new BaseStat(self.name, self.type, value, tags);
    self.emitter.emitStat(stat);
}

function Counter(name, emitter) {
    var self = this;
    self.name = name;
    self.emitter = emitter;
}
Counter.prototype.type = 'counter';
Counter.prototype.increment = emitStat;

function Gauge(name, emitter) {
    var self = this;
    self.name = name;
    self.emitter = emitter;
}
Gauge.prototype.type = 'gauge';
Gauge.prototype.update = emitStat;

function Timing(name, emitter) {
    var self = this;
    self.name = name;
    self.emitter = emitter;
}
Timing.prototype.type = 'timing';
Timing.prototype.add = emitStat;

module.exports = StatEmitter;
