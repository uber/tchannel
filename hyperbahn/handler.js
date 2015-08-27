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

/* jshint maxparams:5 */

var assert = require('assert');
var util = require('util');
var setTimeout = require('timers').setTimeout;

var Errors = require('../errors.js');
var TChannelJSON = require('../as/json');
var TChannelEndpointHandler = require('../endpoint-handler');

var MAX_RELAY_AD_ATTEMPTS = 2;
var RELAY_AD_RETRY_TIME = 1 * 1000;
var RELAY_AD_TIMEOUT = 500;

module.exports = HyperbahnHandler;

function HyperbahnHandler(options) {
    if (!(this instanceof HyperbahnHandler)) {
        return new HyperbahnHandler(options);
    }

    var self = this;
    TChannelEndpointHandler.call(self, 'hyperbahn');

    assert(options && options.channel, 'channel required');
    assert(options && options.egressNodes, 'egressNodes required');
    assert(options && options.callerName, 'callerName required');

    // TODO support blackList

    self.channel = options.channel;
    self.egressNodes = options.egressNodes;
    self.callerName = options.callerName;

    self.tchannelJSON = TChannelJSON({
        logger: self.channel.logger
    });

    // TODO replace JSON with real bufrw handlers for this
    self.tchannelJSON.register(self, 'ad', self,
        self.handleAdvertise);
    self.tchannelJSON.register(self, 'relay-ad', self,
        self.handleRelayAdvertise);
    self.tchannelJSON.register(self, 'unad', self,
        self.handleUnadvertise);
    self.tchannelJSON.register(self, 'relay-unad', self,
        self.handleRelayUnadvertise);

    self.relayAdTimeout = options.relayAdTimeout ||
        RELAY_AD_TIMEOUT;
    self.relayAdRetryTime = options.relayAdRetryTime ||
        RELAY_AD_RETRY_TIME;
    self.maxRelayAdAttempts = options.maxRelayAdAttempts ||
        MAX_RELAY_AD_ATTEMPTS;
}
util.inherits(HyperbahnHandler, TChannelEndpointHandler);

HyperbahnHandler.prototype.type = 'hyperbahn.advertisement-handler';

/*  req: {
        services: Array<{
            serviceName: String,
            cost: Number
        }>
    }

    res: {
        connectionCount: Number
    }
*/
HyperbahnHandler.prototype.handleAdvertise =
function handleAdvertise(self, req, arg2, arg3, cb) {
    self.sendRelays(req, arg2, arg3, 'relay-ad', cb);
};

HyperbahnHandler.prototype.handleUnadvertise =
function handleUnadvertise(self, req, arg2, arg3, cb) {
    self.sendRelays(req, arg2, arg3, 'relay-unad', cb);
};

HyperbahnHandler.prototype.sendRelays =
function sendRelays(req, arg2, arg3, endpoint, cb) {
    /*eslint max-statements: [2, 25], max-params: [2, 6]*/
    var self = this;
    var services = arg3.services;

    var servicesByExitNode = {};

    for (var i = 0; i < services.length; i++) {
        var service = services[i];
        service.hostPort = req.connection.remoteName;

        var serviceName = service.serviceName;
        if (serviceName === '') {
            continue;
        }

        var exitNodes = self.egressNodes.exitsFor(serviceName);
        var exitHosts = Object.keys(exitNodes);

        for (var j = 0; j < exitHosts.length; j++) {
            var exitNode = exitHosts[j];

            var relayReq = servicesByExitNode[exitNode];
            if (!relayReq) {
                relayReq = servicesByExitNode[exitNode] = [];
            }

            relayReq.push(service);
        }
    }

    var exitNodeKeys = Object.keys(servicesByExitNode);
    var counter = 1 + exitNodeKeys.length;
    for (var k = 0; k < exitNodeKeys.length; k++) {
        var hostPort = exitNodeKeys[k];
        var exitNodeServices = servicesByExitNode[hostPort];

        self.sendRelay({
            hostPort: hostPort,
            services: exitNodeServices,
            inreq: req,
            endpoint: endpoint
        }, onFinish);
    }

    onFinish();

    // TODO remove blocking on fanout finish. Requires fixing
    // hyperbahn tests upstream
    function onFinish() {
        if (--counter === 0) {
            cb(null, {
                ok: true,
                head: null,
                body: {
                    connectionCount: exitNodeKeys.length
                }
            });
        }
    }
};

HyperbahnHandler.prototype.sendAdvertise =
function sendAdvertise(services, options, callback) {
    var self = this;

    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    options.serviceName = 'hyperbahn';
    options.trace = false;
    options.hasNoParent = true;
    options.headers = options.headers || {};
    options.headers.cn = self.callerName;

    var req = self.channel.request(options);
    self.tchannelJSON.send(req, 'ad', null, {
        services: services
    }, callback);
};

/*  req: {
        services: Array<{
            serviceName: String,
            hostPort: String,
            cost: Number
        }>
    }

    res: {}
*/
HyperbahnHandler.prototype.handleRelayAdvertise =
function handleRelayAdvertise(self, req, arg2, arg3, cb) {
    self.handleRelay('ad', req, arg2, arg3, cb);
};

HyperbahnHandler.prototype.handleRelayUnadvertise =
function handleRelayUnadvertise(self, req, arg2, arg3, cb) {
    self.handleRelay('unad', req, arg2, arg3, cb);
};

HyperbahnHandler.prototype.handleRelay =
function handleRelay(endpoint, req, arg2, arg3, cb) {
    var self = this;
    var services = arg3.services;
    var logger = self.channel.logger;

    for (var i = 0; i < services.length; i++) {
        var service = services[i];

        var exitNodes = self.egressNodes
            .exitsFor(service.serviceName);
        var exitHosts = Object.keys(exitNodes);

        var myHost = self.channel.hostPort;
        if (exitHosts.indexOf(myHost) < 0) {
            logger.warn('Non-exit node got relay', {
                service: service,
                myHost: myHost,
                exitHosts: exitHosts
            });
        } else if (endpoint === 'ad') {
            self.advertise(service);
        } else if (endpoint === 'unad') {
            self.unadvertise(service);
        } else {
            logger.error('Unexpected endpoint for relay', {
                endpoint: endpoint,
                service: service
            });
        }
    }

    cb(null, {
        ok: true,
        head: null,
        body: {}
    });
};

HyperbahnHandler.prototype.sendRelay =
function sendRelay(opts, callback) {
    var self = this;

    var attempts = 0;

    tryRequest();

    // TODO: move functions out to methods
    function tryRequest() {
        attempts++;

        self.channel.waitForIdentified({
            host: opts.hostPort
        }, onIdentified);

        function onIdentified(err) {
            if (err) {
                return onResponse(err);
            }

            self.tchannelJSON.send(self.channel.request({
                host: opts.hostPort,
                serviceName: 'hyperbahn',
                trace: false,
                timeout: self.relayAdTimeout,
                headers: {
                    cn: self.callerName
                },
                retryLimit: 1,
                parent: opts.inreq
            }), opts.endpoint, null, {
                services: opts.services
            }, onResponse);
        }

        function onResponse(err, response) {
            if (response && response.ok) {
                return callback(null, null);
            }

            var codeName = Errors.classify(err);
            if (attempts <= self.maxRelayAdAttempts && err &&
                (
                    codeName === 'NetworkError' ||
                    codeName === 'Timeout'
                )
            ) {
                setTimeout(tryRequest, self.relayAdRetryTime);
            } else {
                self.logError(err, opts, response);

                callback(null, null);
            }
        }
    }
};

HyperbahnHandler.prototype.logError =
function logError(err, opts, response) {
    var self = this;

    var codeName = Errors.classify(err);
    var logger = self.channel.logger;

    var logOptions = {
        exitNode: opts.hostPort,
        services: opts.services,
        error: err,
        codeName: codeName,
        responseBody: response && response.body
    };

    if (codeName === 'NetworkError' ||
        codeName === 'Timeout'
    ) {
        logger.warn('Relay advertise failed with expected err', logOptions);
    } else {
        logger.error('Relay advertise failed with unexpected err', logOptions);
    }
};

HyperbahnHandler.prototype.advertise =
function advertise(service) {
    var self = this;
    self.channel.topChannel.handler.refreshServicePeer(service.serviceName, service.hostPort);
};

HyperbahnHandler.prototype.unadvertise =
function unadvertise(service) {
    var self = this;
    self.channel.topChannel.handler.removeServicePeer(service.serviceName, service.hostPort);
};
