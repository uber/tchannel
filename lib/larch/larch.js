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
var collectParallel = require('collect-parallel/array');

var Record = require('./record');
var Errors = require('./errors');

module.exports = Larch;

function Larch(options) {
    if (!(this instanceof Larch)) {
        return new Larch(options);
    }

    var self = this;

    self.backends = options.backends;
    assert(Array.isArray(self.backends), 'options.backends must be array');

    if (self.backends.length === 1) {
        self.log = self.logSingleBackend;
    } else {
        self.log = self.logMultiBackend;
    }
}

Larch.prototype.logSingleBackend =
function logSingleBackend(level, msg, meta, cb) {
    var self = this;

    var record = new Record(level, msg, meta, null);

    self.backends[0].log(record, cb);
};

Larch.prototype.logMultiBackend =
function logMultiBackend(level, msg, meta, cb) {
    var self = this;

    var record = new Record(level, msg, meta, null);

    collectParallel(self.backends, writeBackend, writesDone);

    function writeBackend(backend, i, backendCb) {
        backend.log(record, backendCb);
    }

    function writesDone(ignored, results) {
        if (typeof cb === 'function') {
            cb(Errors.resultArrayToError(
                results,
                'larch.log-multi-backend.many-errors'
            ));
        }
    }
};

Larch.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    collectParallel(self.backends, bootstrapBackend, bootstrapsDone);

    function bootstrapBackend(backend, i, backendCb) {
        backend.bootstrap(backendCb);
    }

    function bootstrapsDone(ignored, results) {
        if (typeof cb === 'function') {
            cb(Errors.resultArrayToError(results, 'larch.bootstrap.many-errors'));
        }
    }
};

Larch.prototype.destroy = function destroy(cb) {
    var self = this;

    collectParallel(self.backends, destroyBackend, destroysDone);

    function destroyBackend(backend, i, backendCb) {
        backend.destroy(backendCb);
    }

    function destroysDone(ignored, results) {
        if (typeof cb === 'function') {
            cb(Errors.resultArrayToError(results, 'larch.destroy.many-errors'));
        }
    }
};

Larch.prototype.trace = function trace(msg, meta, cb) {
    this.log('trace', msg, meta, cb);
};

Larch.prototype.debug = function debug(msg, meta, cb) {
    this.log('debug', msg, meta, cb);
};

Larch.prototype.info = function info(msg, meta, cb) {
    this.log('info', msg, meta, cb);
};

Larch.prototype.access = function access(msg, meta, cb) {
    this.log('access', msg, meta, cb);
};

Larch.prototype.warn = function warn(msg, meta, cb) {
    this.log('warn', msg, meta, cb);
};

Larch.prototype.error = function error(msg, meta, cb) {
    this.log('error', msg, meta, cb);
};

Larch.prototype.fatal = function fatal(msg, meta, cb) {
    this.log('fatal', msg, meta, cb);
};
