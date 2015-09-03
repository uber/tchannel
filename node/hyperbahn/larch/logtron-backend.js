'use strict';

var util = require('util');
var assert = require('assert');

var BaseBackend = require('./base_backend');

function LogtronBackend (logtron) {
    if (!(this instanceof LogtronBackend)) {
        return new LogtronBackend(logtron);
    }

    var self = this;

    BaseBackend.call(self);

    self.logtron = logtron;
    assert(
        typeof self.logtron === 'object' &&
        typeof self.logtron.writeEntry === 'function',
        'LogtronBackend expected first argument to be Logtron instance'
    );
}

util.inherits(LogtronBackend, BaseBackend);

LogtronBackend.prototype.log = function log (record, cb) {
    var self = this;

    self.logtron.writeEntry(record, cb);
};

