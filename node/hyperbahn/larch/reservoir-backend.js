var assert = require('assert');
var util = require('util');
var timers = require('timers');

var BaseBackend = require('./base-backend');

function ReservoirBackend (options) {
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

    self.rand = options.rand || ReservoirBackend.rand;
    assert(
        typeof self.rand == 'function',
        'options.rand must be function'
    );

    self.flush = options.flush;
    assert(
        typeof self.flush === 'function',
        'options.flush required to be function'
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

ReservoirBackend.prototype.flush = function flush (records) {
    var copy = records.slice(0);
    self.backend.logMany(copy);
};

ReservoirBackend.rand = function rand (lo, hi) {
    return (Math.floor(Math.random() * 1000) % (hi - lo)) + lo;
};

ReservoirBackend.prototype.log = function log (record, cb) {
    var self = this;

    cb();

    self.count += 1;

    if (self.records.length < self.size) {
        self.records.push(record);
    } else {
        var probability = self.rand(1, self.count);
        if (probability < self.records.length) {
            // evict and replace
            self.records[probability] = record;
        }
    }
};

ReservoirBackend.prototype.destroy = function destroy (cb) {
    self.timers.clearTimeout(self.timer);
    self.backend.destroy(cb);
};

ReservoirBackend.prototype.bootstrap = function bootstrap (cb) {
    var self = this;

    self.timer = self.timers.setTimeout(onTimer, self.flushInterval);

    function onTimer() {
        self.flush(self.records);
        self.records.length = 0;
        self.count = 0;

        self.timer = self.timers.setTimeout(onTimer, self.flushInterval);
    }

    self.backend.bootstrap(cb);
};
