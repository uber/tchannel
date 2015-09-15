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
var fs = require('fs');
var TypedError = require('error/typed');
var WrappedError = require('error/wrapped');
var timers = require('timers');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var safeJsonParse = require('safe-json-parse/tuple');

var Reporter = require('../tcollector/reporter.js');
var TChannelJSON = require('../as/json.js');

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
var DEFAULT_ERROR_RETRY_TIMES = [
    200, // One fast retry

    1000, // Fibonacci backoff
    1000,
    2000,
    3000,
    5000,
    8000,

    10000 // Max out at 10 seconds
];
var DEFAULT_TIMEOUT = 500;

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

    assert(options && options.tchannel && !options.tchannel.topChannel,
        'Must pass in top level tchannel');
    assert(options.tchannel.tracer, 'Top channel must have trace enabled');
    assert(options.serviceName, 'must pass in serviceName');
    if (Array.isArray(options.hostPortList)) {
        self.hostPortList = options.hostPortList;
    } else if (typeof options.hostPortFile === 'string') {
        var tuple = safeSyncRead(options.hostPortFile);
        assert(!tuple[0], 'Read host port list failed with ' + tuple[0]);
        tuple = safeJsonParse(tuple[1]);
        assert(!tuple[0], 'Parse host port list failed with ' + tuple[0]);
        assert(Array.isArray(tuple[1]), 'Host port list in the file is not array');
        self.hostPortList = tuple[1];
    } else {
        assert(false, 'Must pass in hostPortList as array or hostPortFile as string');
    }

    self.serviceName = options.serviceName;
    self.callerName = options.callerName || options.serviceName;
    self.tchannel = options.tchannel;
    self.reportTracing = 'reportTracing' in options ?
        options.reportTracing : true;
    self.hardFail = !!options.hardFail;
    self.advertiseInterval = options.advertiseInterval || DEFAULT_TTL;
    self.timeoutFuzz = self.advertiseInterval;
    self.errorRetryTimes = options.errorRetryTimes || DEFAULT_ERROR_RETRY_TIMES;

    self.logger = options.logger || self.tchannel.logger;
    self.statsd = options.statsd;

    self.reporter = Reporter({
        channel: self.getClientChannel({
            serviceName: 'tcollector',
            trace: false
        }),
        logger: self.logger,
        callerName: self.callerName,
        logWarnings: options.logTraceWarnings
    });
    self.tchannel.tracer.reporter = function report(span) {
        if (self.reportTracing) {
            self.reporter.report(span);
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
            peers: self.hostPortList,
            preferConnectionDirection: 'in'
        });
    self.tchannelJSON = TChannelJSON();

    self.lastError = null;
    self.latestAdvertisementResult = null;
    self.attemptCounter = 0;
    self.state = States.UNADVERTISED;
    self._destroyed = false;
    self.defaultTimeout = options.defaultTimeout || DEFAULT_TIMEOUT;

    var advertisementTimeout = options.advertisementTimeout ||
        options.registrationTimeout;
    if (self.hardFail) {
        self.advertisementTimeoutTime = advertisementTimeout || 5000;
    } else {
        self.advertisementTimeoutTime = 0;
        self.logger.info('HyperbahnClient advertisement timeout disabled', {
            service: self.serviceName
        });
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

    assert(options && options.serviceName, 'must pass serviceName');

    if (self._destroyed) {
        self.emit('error', AlreadyDestroyed({
            method: 'getClientChannel'
        }));
        return null;
    }

    if (self.tchannel.subChannels[options.serviceName]) {
        return self.tchannel.subChannels[options.serviceName];
    }

    var channelOptions = {
        peers: self.hostPortList,
        serviceName: options.serviceName,
        preferConnectionDirection: 'in',
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

HyperbahnClient.prototype.sendRequest =
function sendRequest(opts, endpoint, cb) {
    var self = this;

    var req = self.hyperbahnChannel.request({
        serviceName: 'hyperbahn',
        timeout: (opts && opts.timeout) || self.defaultTimeout,
        hasNoParent: true,
        trace: false,
        retryLimit: 1,
        headers: {
            cn: self.callerName
        }
    });
    self.tchannelJSON.send(req, endpoint, null, {
        services: [{
            cost: 0,
            serviceName: self.serviceName
        }]
    }, cb);
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

    assert(self.tchannel.hostPort,
        'must call tchannel.listen() before advertise()');

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
    }

    self.attemptCounter++;
    self.sendRequest(opts, 'ad', advertiseInternalCb);
    self.emit('advertise-attempt');

    function advertiseInternalCb(err, result) {
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

            self.advertiseAgain(self.getErrorRetryTime());
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
                self.advertiseAgain(self.getErrorRetryTime());
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
        self.attemptCounter = 0;
        self.state = States.ADVERTISED;
        timers.clearTimeout(self.advertisementTimeoutTimer);

        self.advertiseAgain(self.getHealthyRetryTime());

        // registered event is deprecated
        self.emit('registered');
        self.emit('advertised');
    }
};

HyperbahnClient.prototype.unadvertise =
function unadvertise(opts) {
    var self = this;
    self.sendRequest(opts, 'unad', unadvertiseInternalCb);
    timers.clearTimeout(self._advertisementTimer);
    timers.clearTimeout(self.advertisementTimeoutTimer);
    self.latestAdvertisementResult = null;
    self.state = States.UNADVERTISED;
    self.emit('unadvertised');
    function unadvertiseInternalCb(error, result) {
        if (error) {
            self.logger.warn('HyperbahnClient: unadvertisement failure', {
                error: error,
                serviceName: self.serviceName,
                hostPort: self.hostPort
            });
            return;
        }
    }
};

HyperbahnClient.prototype.getErrorRetryTime = function getErrorRetryTime() {
    var self = this;

    return self.errorRetryTimes[self.attemptCounter - 1] ||
        self.errorRetryTimes[self.errorRetryTimes.length - 1];
};

HyperbahnClient.prototype.getHealthyRetryTime = function getHealthyRetryTime() {
    var self = this;

    var fuzz = self.timeoutFuzz;
    var delay = Math.round(Math.floor(Math.random() * fuzz)) - (fuzz / 2);

    return self.advertiseInterval + delay;
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
    var self = this;
    if (self._destroyed) {
        return;
    }

    self._destroyed = true;
    timers.clearTimeout(self._advertisementTimer);
    timers.clearTimeout(self.advertisementTimeoutTimer);
};

function safeSyncRead(filePath) {
    var fileContents = null;
    var error;

    try {
        fileContents = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        error = err;
    }

    return [error, fileContents];
}
