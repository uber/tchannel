'use strict';

var fs = require('fs');
var fetchConfig = require('zero-config');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var WrappedError = require('error/wrapped');

var setupEndpoints = require('./endpoints/');
var ApplicationClients = require('./clients/');

var ExitNode = require('./exit');
var EntryNode = require('./entry');

var ApplicationClientsFailureError = WrappedError({
    type: 'autobahn.app-clients-failed',
    message: 'Application createClients failed: {origMessage}'
});

module.exports = Application;

function Application(opts) {
    if (!(this instanceof Application)) {
        return new Application(opts);
    }

    var self = this;
    EventEmitter.call(self);

    opts = opts || {};
    self.seedConfig = opts.seedConfig;
    self.seedClients = opts.clients || {};

    self.config = fetchConfig(__dirname, {
        dc: fs.existsSync('/etc/uber/datacenter') ?
            /*istanbul ignore next*/ '/etc/uber/datacenter' :
            /*istanbul ignore next*/ null,
        seed: self.seedConfig,
        loose: false // opt into strict mode
    });
    self.clients = ApplicationClients({
        config: self.config,
        seedClients: self.seedClients,
        serviceReqDefaults: opts.serviceReqDefaults,
        servicePurgePeriod: opts.servicePurgePeriod,
        period: opts.period,
        maxErrorRate: opts.maxErrorRate,
        minRequests: opts.minRequests,
        probation: opts.probation
    });
    self.services = null;
    self.tchannel = self.clients.tchannel;

    self.isBootstrapped = false;

    // internal because its already deprecated
    self._controlServer = null;

    self.destroyed = false;
    // When we need to force destroy an app to test something,
    // we set this to true. Then we don't throw a 'double
    // destroy' error in destroy().
    self.forceDestroyed = false;
}

inherits(Application, EventEmitter);

Application.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    if (self.isBootstrapped) {
        throw new Error('double bootstrap');
    }
    self.isBootstrapped = true;

    self.services = {};
    self.services.exitNode = ExitNode(self.clients);
    self.services.entryNode = EntryNode(self.clients);

    setupEndpoints(self.clients, self.services);

    self.clients.bootstrap(onClientsReady);

    function onClientsReady(err) {
        /* istanbul ignore next */
        if (err) {
            err = ApplicationClientsFailureError(err);
            return cb(err);
        }

        // necessary to expose app through repl
        self.clients.repl.setApp(self);

        cb(null);
    }

};

Application.prototype.bootstrapAndListen =
function bootstrapAndListen(callback) {
    var self = this;

    self.bootstrap(onBootstrap);

    function onBootstrap(err) {
        if (err) {
            return callback(err);
        }

        callback(null);
    }
};

Application.prototype.destroy = function destroy(opts) {
    var self = this;

    if (self.destroyed && !self.forceDestroyed) {
        throw new Error('double destroy');
    } else if (self.forceDestroyed) {
        // We were already destroyed
        return;
    }

    if (opts && opts.force) {
        self.forceDestroyed = true;
    }

    self.destroyed = true;

    self.clients.destroy();
};
