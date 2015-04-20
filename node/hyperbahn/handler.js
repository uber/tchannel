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

var TChannelJSON = require('../as/json');
var EgressNodes = require('./egress-nodes');
var TChannelEndpointHandler = require('../endpoint-handler');

module.exports = HyperbahnHandler;

function HyperbahnHandler(options) {
    if (!(this instanceof HyperbahnHandler)) {
        return new HyperbahnHandler(options);
    }

    var self = this;
    TChannelEndpointHandler.call(self, 'hyperbahn');

    assert(options && options.channel, 'channel required');
    assert(options && options.ringpop, 'ringpop required');
    assert(options && options.egressNodes, 'egressNodes required');

    // TODO support blackList

    self.channel = options.channel;
    self.type = 'hyperbahn.advertisement-handler';
    self.ringpop = options.ringpop;
    self.egressNodes = options.egressNodes;

    self.tchannelJSON = TChannelJSON({
        logger: self.channel.logger
    });

    // TODO replace JSON with real bufrw handlers for this
    self.tchannelJSON.register(self, 'ad', self,
        self.handleAdvertise);
    self.tchannelJSON.register(self, 'relay-ad', self,
        self.handleRelayAdvertise);
}
util.inherits(HyperbahnHandler, TChannelEndpointHandler);

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
    /*eslint max-statements: [2, 25], max-params: [2, 5]*/
    var services = arg3.services;

    var servicesByExitNode = {};

    for (var i = 0; i < services.length; i++) {
        var serviceObj = services[i];
        serviceObj.hostPort = req.remoteAddr;

        var serviceName = serviceObj.serviceName;
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

            relayReq.push(serviceObj);
        }
    }

    var exitNodeKeys = Object.keys(servicesByExitNode);
    var counter = 1 + exitNodeKeys.length;
    for (var k = 0; k < exitNodeKeys.length; k++) {

        var hostPort = exitNodeKeys[k];
        var exitNodeServices = servicesByExitNode[hostPort];

        self.sendRelayAdvertise(
            hostPort, exitNodeServices, onFinish
        );
    }

    onFinish();

    // TODO remove blocking on fanout finish. Requires fixing
    // autobahn tests upstream
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

    var channel = options.channel || self.channel;

    self.tchannelJSON.send(channel.request({
        timeout: options.timeout,
        service: 'hyperbahn'
    }), 'ad', null, {
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
    /*eslint max-params: [2, 5]*/
    var services = arg3.services;
    var logger = self.channel.logger;

    for (var i = 0; i < services.length; i++) {
        var serviceObj = services[i];

        var exitNodes = self.egressNodes
            .exitsFor(serviceObj.serviceName);
        var exitHosts = Object.keys(exitNodes);

        var myHost = self.ringpop.whoami();
        if (exitHosts.indexOf(myHost) !== -1) {
            self.advertise(serviceObj);
        } else {
            logger.warn('Non-exit node got relay handle advertise', {
                myHost: myHost,
                exitHosts: exitHosts,
                serviceObj: serviceObj
            });
        }
    }

    cb(null, {
        ok: true,
        head: null,
        body: {}
    });
};

HyperbahnHandler.prototype.sendRelayAdvertise =
function sendRelayAdvertise(hostPort, services, callback) {
    var self = this;

    self.tchannelJSON.send(self.channel.request({
        host: hostPort,
        timeout: 500,
        service: 'hyperbahn'
    }), 'relay-ad', null, {
        services: services
    }, onRelayAdvertise);

    function onRelayAdvertise(err, response) {
        if (response && response.ok) {
            return callback(null, null);
        }

        var logger = self.channel.logger;
        logger.error('Could not send relay advertise', {
            exitNode: hostPort,
            services: services,
            err: err,
            responseBody: response && response.body
        });

        callback(null, null);
    }
};

HyperbahnHandler.prototype.advertise =
function advertise(serviceObj) {
    throw new Error('not implemented');
};
