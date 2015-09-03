'use strict';

var assert = require('assert');
var collectParallel = require('collect-parallel/array');

module.exports = Larch;

function Larch (options) {
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
function logSingleBackend (level, msg, meta, cb) {
    var self = this;

    self.backends[0].log(level, msg, meta, cb);
};

Larch.prototype.logMultiBackend =
function logMultiBackend (level, msg, meta, cb) {
    var self = this;

    var i;
    for (i = 0; i < self.backends.length; i++) {
        self.backends[i].log(level, msg, meta, backendDone);
    }

    var done = 0;
    function backendDone() {
        done++;

        if (done === self.backends.length) {
            cb();
        }
    }
};

Larch.prototype.bootstrap = function bootstrap (cb) {
    var self = this;

    collectParallel(self.backends, bootstrapBackend, cb);

    function bootstrapBackend(backend, i, cb) {
        backend.bootstrap(cb);
    }
};

Larch.prototype.destroy = function destroy (cb) {
    var self = this;

    collectParallel(self.backends, destroyBackend, cb);

    function destroyBackend(backend, i, cb) {
        backend.destroy(cb);
    }
};
