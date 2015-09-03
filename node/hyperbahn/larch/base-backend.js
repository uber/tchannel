'use strict';

var assert = require('assert');

module.exports = BaseBackend;

function BaseBackend (options) {
    if (!(this instanceof BaseBackend)) {
        return new BaseBackend(options);
    }

    var self = this;

    assert(
        typeof self.log === 'function' &&
        self.log !== BaseBackend.prototype.log,
        '`log` method of BaseBackend must be overridden by function'
    );

    assert(
        typeof self.bootstrap === 'function',
        '`bootstrap` method of BaseBackend must be overridden by function'
    );

    assert(
        typeof self.destroy === 'function',
        '`bootstrap` method of BaseBackend must be overridden by function'
    );

    assert(
        typeof self.logMany === 'function',
        '`logMany` method of BaseBackend must be overriden by function'
    );
}

BaseBackend.prototype.log = function log (record, cb) {};

BaseBackend.prototype.bootstrap = function bootstrap (cb) {
    cb();
};

BaseBackend.prototype.destroy = function bootstrap (cb) {
    cb();
};

BaseBackend.prototype.logMany = function logMany (records, cb) {
    var self = this;

    collectParallel(records, eachRecord, cb);

    function eachRecord(record, i, cb) {
        self.log(record, cb);
    }
};
