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
var TypedError = require('error/typed');
var WrappedError = require('error/wrapped');
var timers = require('timers');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var NullLogtron = require('null-logtron');
var NullStatsd = require('uber-statsd-client/null');
var TChannelJSON = require('tchannel/as/json');
var Reporter = require('tcollector-reporter');

var HyperbahnClientInvalidOptionError = TypedError({
    type: 'hyperbahn-client.invalid-option',
    message: 'HyperbahnClient {method}: invalid option {name}' +
        ', expected {expected}, got {actual}'
});

var RegistrationTimeoutError = WrappedError({
    type: 'hyperbahn-client.registration-timeout',
    message: 'Hyperbahn registration timed out after {time} ms!.\n' +
        '{origMessage}.\n'
});

var AlreadyDestroyed = TypedError({
    type: 'hyperbahn-client.already-destroyed',
    message: 'HyperbahnClient was already destroyed.\n' +
        'Cannot invoke {method}.',
    method: null
});

var States = {
    UNREGISTERED: 'UNREGISTERED',
    REGISTERED: 'REGISTERED'
};
var DEFAULT_TTL = 60 * 1000;
var REGISTER_ERROR_DELAY = 200;

module.exports = HyperbahnClient;

// # HyperbahnClient
// options.
//   * (required) tchannel: tchannel instance
//   * (required) serviceName: string service name
//   * (required) hostPortList: array of initial hyperbahn nodes
//   * callerName: the caller name
//   * logger: logtron instance
//   * reportTracing: Whether to report tracing
//   * hardFail: boolean; default false; whether or not to fail hard when we
//     can't register or on unexpected hyperbahn errors
//   * registrationTimeout: integer. In hardFail mode we default to 5000. If
//     not in hardFail mode we don't time out registrations.
function HyperbahnClient(options) {
    /*eslint max-statements: [2, 25] complexity: [2, 20] */
    if (!(this instanceof HyperbahnClient)) {
        return new HyperbahnClient(options);
    }

    var self = this;

    EventEmitter.call(this);

    if (!options || !options.tchannel || options.tchannel.topChannel) {
        throw HyperbahnClientInvalidOptionError({
            method: 'constructor',
            name: 'tchannel',
            expected: 'top level tchannel instance',
            actual: options ? typeof options.tchannel : 'undefined'
        });
    }

    if (!options.serviceName) {
        throw HyperbahnClientInvalidOptionError({
            method: 'constructor',
            name: 'serviceName',
            expected: 'string',
            actual: typeof options.serviceName
        });
    }
    if (!Array.isArray(options.hostPortList)) {
        throw HyperbahnClientInvalidOptionError({
            method: 'constructor',
            name: 'hostPortList',
            expected: 'array',
            actual: typeof options.hostPortList
        });
    }

    self.hostPortList = options.hostPortList;

    self.serviceName = options.serviceName;
    self.callerName = options.callerName || options.serviceName;
    self.tchannel = options.tchannel;
    self.reportTracing = 'reportTracing' in options ?
        options.reportTracing : true;

    self.logger = options.logger || NullLogtron();
    self.statsd = options.statsd || NullStatsd();

    assert(self.tchannel.tracer,
        'Top channel must have trace enabled'
    );

    var reporter = Reporter({
        channel: self.tchannel.makeSubChannel({
            trace: false,
            serviceName: 'tcollector',
            peers: self.hostPortList
        }),
        logger: options.logger
    });
    self.tchannel.tracer.reporter = function report(span) {
        if (self.reportTracing) {
            reporter.report(span);
        }
    };

    if (!self.reportTracing) {
        self.logger.warn('AutobahnClient tcollector tracing is OFF', {
            service: self.serviceName
        });
    }

    self.hyperbahnChannel = self.tchannel.subChannels.hyperbahn ||
        self.tchannel.makeSubChannel({
            serviceName: 'hyperbahn',
            peers: self.hostPortList
        });

    self.tchannelJSON = TChannelJSON({
        logger: self.logger
    });

    self.hardFail = !!options.hardFail;
    self.lastError = null;
    self.latestRegistrationResult = null;

    self.state = States.UNREGISTERED;
    self._destroyed = false;

    if (self.hardFail) {
        self.registrationTimeoutTime = options.registrationTimeout || 5000;
    } else {
        self.registrationTimeoutTime = options.registrationTimeout;
    }
}

util.inherits(AutobahnClient, EventEmitter);

AutobahnClient.prototype.setReportTracing = function setReportTracing(bool) {
    var self = this;

    self.reportTracing = bool;
};

// Gets the subchannel for hitting a particular service.
AutobahnClient.prototype.getClientChannel = function getClientChannel(options) {
    var self = this;

    if (self._destroyed) {
        self.emit('error', AlreadyDestroyed({
            method: 'getClientChannel'
        }));
        return null;
    }

    if (!options || !options.serviceName) {
        throw AutobahnClientInvalidOptionError({
            method: 'getClientSubChannel',
            name: 'serviceName',
            expected: 'string',
            actual: options ? typeof options.serviceName : 'undefined'
        });
    }

    if (self.tchannel.subChannels[options.serviceName]) {
        return self.tchannel.subChannels[options.serviceName];
    }

    return self.tchannel.makeSubChannel({
        serviceName: options.serviceName,
        requestDefaults: {
            serviceName: options.serviceName,
            timeout: options.timeout,
            retryLimit: options.retryLimit,
            headers: {
                cn: self.callerName
            }
        },
        peers: self.hostPortList
    });
};

// ## registrationTimeout
// Called after a certain amount of time to have a fatal error when reg fails.
// Will not be called if options.registrationTimeout isn't passed in
AutobahnClient.prototype.registrationTimeout =
function registrationTimeout() {
    var self = this;

    if (self.state === States.UNREGISTERED) {
        var lastError = self.lastError ||
            new Error('registration timeout!');
        var err = RegistrationTimeoutError(lastError, {
            time: self.registrationTimeoutTime
        });

        self.logger.fatal('AutobahnClient: registration timed out', {
            timeout: self.registrationTimeout,
            error: err
        });

        self.registrationFailure(err);
    }
    // TODO else warn
};

AutobahnClient.prototype.registrationFailure =
function registrationFailure(err) {
    var self = this;

    self.destroy();
    self.emit('error', err);

    self.statsd.increment(
        'hyperbahn-client.' + self.serviceName + '.registration.failure'
    );
};

// ## register
// Register with Autobahn. If called with a callback, the callback will not be
// called until there has been a successful registration. This function
// attempts a register and retries until there are no healthy servers left; it
// will then repeatedly choose random servers to try until it finds one that
// works.
AutobahnClient.prototype.register = function register(opts) {
    var self = this;
    // Attempt a registration. If it succeeds, setTimeout to re-register with
    // the same server after the TTL.

    if (self._destroyed) {
        self.emit('error', AlreadyDestroyed({
            method: 'register'
        }));
        return;
    }

    if (self.registrationTimeoutTime) {
        // Start the timeout timer
        self.registrationTimeoutTimer = timers.setTimeout(
            function registrationTimeoutTimer() {
                self.registrationTimeout();
            },
            self.registrationTimeoutTime
        );
    } else {
        self.logger.info('AutobahnClient registration timeout disabled', {
            service: self.serviceName
        });
    }

    assert(self.tchannel.hostPort,
        'must call tchannel.listen() before register()'
    );

    var req = self.hyperbahnChannel.request({
        serviceName: 'hyperbahn',
        timeout: (opts && opts.timeout) || 50,
        hasNoParent: true,
        headers: {
            cn: self.callerName
        }
    });
    self.tchannelJSON.send(req, 'ad', null, {
        services: [{
            cost: 0,
            serviceName: self.serviceName
        }]
    }, function registerInternalCb(err, result) {
        /*eslint max-statements: [2, 40] */
        if (err) {
            self.logger[self.hardFail ? 'error' : 'warn'](
                'AutobahnClient: registration failure, ' +
                'marking server as sick', {
                error: err,
                serviceName: self.serviceName,
                hostPort: self.hostPort
            });
            self.lastError = err;

            self.registerAgain(REGISTER_ERROR_DELAY);
            return;
        }

        if (result.ok === false) {
            err = result.body;
            var errInfo2 = {
                error: err,
                serviceName: self.serviceName,
                hostPort: self.hostPort
            };
            if (err.type === 'autobahn.register.invalid-service-name') {
                self.logger[self.hardFail ? 'fatal' : 'warn'](
                    'AutobahnClient: invalid service name (from Autobahn)',
                    errInfo2
                );
            } else if (err.type === 'autobahn.register.invalid-host-port') {
                self.logger[self.hardFail ? 'fatal' : 'warn'](
                    'AutobahnClient: invalid service name (from Autobahn)',
                    errInfo2
                );
            } else {
                self.logger[self.hardFail ? 'fatal' : 'warn'](
                    'AutobahnClient: unexpected failure (from Autobahn)',
                    errInfo2
                );
            }

            if (self.hardFail) {
                self.registrationFailure(err);
            } else {
                self.registerAgain(REGISTER_ERROR_DELAY);
            }

            return;
        }

        self.statsd.increment(
            'hyperbahn-client.' + self.serviceName +
                '.registration.success'
        );

        self.latestRegistrationResult = result;
        self.state = States.REGISTERED;
        timers.clearTimeout(self.registrationTimeoutTimer);

        var ttl = DEFAULT_TTL;

        self.registerAgain(ttl);
        self.emit('registered');
    });

    self.emit('register-attempt');
};

AutobahnClient.prototype.registerAgain =
function registerAgain(delay) {
    var self = this;

    if (self._destroyed) {
        return;
    }

    self._registrationTimer = timers.setTimeout(
        function registerTimeout() {
            self.register();
        },
        delay
    );
};

// ## destroy
AutobahnClient.prototype.destroy = function destroy() {
    this._destroyed = true;
    timers.clearTimeout(this._registrationTimer);
    timers.clearTimeout(this.registrationTimeoutTimer);
};
