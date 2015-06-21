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

var Reporter = require('../tcollector/reporter.js');
var TChannelJSON = require('../as/json.js');

var HyperbahnClientInvalidOptionError = TypedError({
    type: 'hyperbahn-client.invalid-option',
    message: 'HyperbahnClient {method}: invalid option {name}' +
        ', expected {expected}, got {actual}'
});

var AdvertisementTimeoutError = WrappedError({
    type: 'hyperbahn-client.advertisement-timeout',
    message: 'Hyperbahn advertisement timed out after {time} ms!.\n' +
        '{origMessage}.\n'
});

var AlreadyDestroyed = TypedError({
    type: 'hyperbahn-client.already-destroyed',
    message: 'HyperbahnClient was already destroyed.\n' +
        'Cannot invoke {method}.',
    method: null
});

var States = {
    UNADVERTISED: 'UNADVERTISED',
    ADVERTISED: 'ADVERTISED'
};
var DEFAULT_TTL = 60 * 1000;
var ADVERTISEMENT_ERROR_DELAY = 200;

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
//     can't advertise or on unexpected hyperbahn errors
//   * registrationTimeout: deprecated
//   * advertisementTimeout: integer. In hardFail mode we default to 5000. If
//     not in hardFail mode we don't time out advertisements.
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

    self.logger = options.logger || self.tchannel.logger;
    self.statsd = options.statsd;

    assert(self.tchannel.tracer,
        'Top channel must have trace enabled'
    );

    var reporter = Reporter({
        channel: self.getClientChannel({
            serviceName: 'tcollector',
            trace: false
        }),
        logger: options.logger,
        callerName: self.callerName
    });
    self.tchannel.tracer.reporter = function report(span) {
        if (self.reportTracing) {
            reporter.report(span);
        }
    };

    if (!self.reportTracing) {
        self.logger.warn('HyperbahnClient tcollector tracing is OFF', {
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
    self.latestAdvertisementResult = null;

    self.state = States.UNADVERTISED;
    self._destroyed = false;

    var advertisementTimeout = options.advertisementTimeout ||
        options.registrationTimeout;

    if (self.hardFail) {
        self.advertisementTimeoutTime = advertisementTimeout || 5000;
    } else {
        self.advertisementTimeoutTime = advertisementTimeout;
    }
}

util.inherits(HyperbahnClient, EventEmitter);

HyperbahnClient.prototype.setReportTracing = function setReportTracing(bool) {
    var self = this;

    self.reportTracing = bool;
};

// Gets the subchannel for hitting a particular service.
HyperbahnClient.prototype.getClientChannel =
function getClientChannel(options) {
    var self = this;

    if (self._destroyed) {
        self.emit('error', AlreadyDestroyed({
            method: 'getClientChannel'
        }));
        return null;
    }

    if (!options || !options.serviceName) {
        throw HyperbahnClientInvalidOptionError({
            method: 'getClientChannel',
            name: 'serviceName',
            expected: 'string',
            actual: options ? typeof options.serviceName : 'undefined'
        });
    }

    if (self.tchannel.subChannels[options.serviceName]) {
        return self.tchannel.subChannels[options.serviceName];
    }

    var channelOptions = {
        peers: self.hostPortList,
        serviceName: options.serviceName,
        requestDefaults: {
            serviceName: options.serviceName,
            headers: {
                cn: self.callerName
            }
        }
    };
    if ('trace' in options) {
        channelOptions.trace = options.trace;
    }
    if ('timeout' in options) {
        channelOptions.requestDefaults.timeout = options.timeout;
    }
    if ('retryLimit' in options) {
        channelOptions.requestDefaults.retryLimit = options.retryLimit;
    }

    return self.tchannel.makeSubChannel(channelOptions);
};

// ## advertisementTimeout
// Called after a certain amount of time to have a fatal error when reg fails.
// Will not be called if options.advertisementTimeout isn't passed in
HyperbahnClient.prototype.advertisementTimeout =
function advertisementTimeout() {
    var self = this;

    if (self.state === States.UNADVERTISED) {
        var lastError = self.lastError ||
            new Error('advertisement timeout!');
        var err = AdvertisementTimeoutError(lastError, {
            time: self.advertisementTimeoutTime
        });

        self.logger.fatal('HyperbahnClient: advertisement timed out', {
            timeout: self.advertisementTimeout,
            error: err
        });

        self.advertisementFailure(err);
    }
    // TODO else warn
};

HyperbahnClient.prototype.advertisementFailure =
function advertisementFailure(err) {
    var self = this;

    self.destroy();
    self.emit('error', err);

    if (self.statsd) {
        self.statsd.increment(
            'hyperbahn-client.' + self.serviceName + '.advertisement.failure'
        );
    }
};

// ## advertise
// Advertise with Hyperbahn. If called with a callback, the callback will not be
// called until there has been a successful advertisement. This function
// attempts a advertise and retries until there are no healthy servers left; it
// will then repeatedly choose random servers to try until it finds one that
// works.
// register is **deprecated**
HyperbahnClient.prototype.register =
HyperbahnClient.prototype.advertise =
function advertise(opts) {
    var self = this;
    // Attempt a advertisement. If it succeeds, setTimeout to re-advertise with
    // the same server after the TTL.

    if (self._destroyed) {
        self.emit('error', AlreadyDestroyed({
            method: 'advertise'
        }));
        return;
    }

    if (self.advertisementTimeoutTime) {
        // Start the timeout timer
        self.advertisementTimeoutTimer = timers.setTimeout(
            function advertisementTimeoutTimer() {
                self.advertisementTimeout();
            },
            self.advertisementTimeoutTime
        );
    } else {
        self.logger.info('HyperbahnClient advertisement timeout disabled', {
            service: self.serviceName
        });
    }

    assert(self.tchannel.hostPort,
        'must call tchannel.listen() before advertise()'
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
    }, function advertiseInternalCb(err, result) {
        /*eslint max-statements: [2, 40] */
        if (err) {
            self.logger[self.hardFail ? 'error' : 'warn'](
                'HyperbahnClient: advertisement failure, ' +
                'marking server as sick', {
                error: err,
                serviceName: self.serviceName,
                hostPort: self.hostPort
            });
            self.lastError = err;

            self.advertiseAgain(ADVERTISEMENT_ERROR_DELAY);
            return;
        }

        if (result.ok === false) {
            err = result.body;
            var errInfo2 = {
                error: err,
                serviceName: self.serviceName,
                hostPort: self.hostPort
            };

            self.logger[self.hardFail ? 'fatal' : 'warn'](
                'HyperbahnClient: unexpected failure (from Hyperbahn)',
                errInfo2
            );

            if (self.hardFail) {
                self.advertisementFailure(err);
            } else {
                self.advertiseAgain(ADVERTISEMENT_ERROR_DELAY);
            }

            return;
        }

        if (self.statsd) {
            self.statsd.increment(
                'hyperbahn-client.' + self.serviceName +
                    '.advertisement.success'
            );
        }

        self.latestAdvertisementResult = result;
        self.state = States.ADVERTISED;
        timers.clearTimeout(self.advertisementTimeoutTimer);

        var ttl = DEFAULT_TTL;

        self.advertiseAgain(ttl);

        // registered event is deprecated
        self.emit('registered');
        self.emit('advertised');
    });

    self.emit('advertise-attempt');
};

HyperbahnClient.prototype.advertiseAgain =
function advertiseAgain(delay) {
    var self = this;

    if (self._destroyed) {
        return;
    }

    self._advertisementTimer = timers.setTimeout(
        function advertiseTimeout() {
            self.advertise();
        },
        delay
    );
};

// ## destroy
HyperbahnClient.prototype.destroy = function destroy() {
    this._destroyed = true;
    timers.clearTimeout(this._advertisementTimer);
    timers.clearTimeout(this.advertisementTimeoutTimer);
};
