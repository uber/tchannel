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
var RelayHandler = require('../relay_handler');

var REGISTER_GRACE_PERIOD = 1000;
var REGISTER_TTL = 1000;

function ServiceDispatchHandler(options) {
    if (!(this instanceof ServiceDispatchHandler)) {
        return new ServiceDispatchHandler(options);
    }
    var self = this;

    self.options = options;
    assert(options, 'service dispatch handler options not actually optional');
    self.channel = self.options.channel;
    self.config = self.options.config;
    self.logger = self.options.logger;
    self.statsd = self.options.statsd;
    self.egressNodes = self.options.egressNodes;

    self.egressNodes.on('membershipChanged', onMembershipChanged);

    self.registerTTL = numberOrDefault(self.config,
        'core.exitNode.registerTTL', REGISTER_TTL);
    self.registrationGracePeriod = numberOrDefault(self.config,
        'core.exitNode.registrationGracePeriod', REGISTER_GRACE_PERIOD);

    function onMembershipChanged() {
        self.updateServiceChannels();
    }
}

ServiceDispatchHandler.prototype.type = 'tchannel.hyperbahn.service-dispatch-handler';

ServiceDispatchHandler.prototype.handleRequest =
function handleRequest(req, buildRes) {
    /* eslint max-statements:[2,20] */
    var self = this;
    if (!req.serviceName) {
        self.logger.error('Got incoming req with no service', {
            serviceName: req.serviceName,
            arg1: String(req.arg1)
        });

        buildRes().sendError('BadRequest', 'no service name given');
        return;
    }

    if (!req.streamed) {
        var name = String(req.arg1);
        self.onEndpointHandled(req.serviceName, name);
    } else {
        var statsdKey = 'server.request-stream.' + req.serviceName;
        self.statsd.increment(statsdKey);
    }

    var chan = self.channel.subChannels[req.serviceName];
    if (chan) {
        // Temporary hack. Need to set json by default because
        // we want to upgrade without breaking ncar
        chan.handler.handleRequest(req, buildRes);
    } else {
        self.handleDefault(req, buildRes);
    }
};

ServiceDispatchHandler.prototype.onEndpointHandled =
function onEndpointHandled(service, name) {
    var self = this;

    var logRequest = self.config.get('server.logRequest');

    var endpointName = name
        .replace(/\//g, '_')
        .replace(/:/g, '_');

    var statsdKey = 'server.request.' + service +
        '.' + endpointName;

    self.statsd.increment(statsdKey);

    if (logRequest && logRequest[name] === false) {
        return;
    }
};

ServiceDispatchHandler.prototype.handleDefault =
function handleDefault(req, buildRes) {
    var self = this;
    var svcchan = self.getOrCreateServiceChannel(req.serviceName);
    svcchan.handler.handleRequest(req, buildRes);
};

ServiceDispatchHandler.prototype.getOrCreateServiceChannel =
function getOrCreateServiceChannel(serviceName) {
    var self = this;
    return self.getServiceChannel(serviceName, true);
};

ServiceDispatchHandler.prototype.getServiceChannel =
function getServiceChannel(serviceName, create) {
    var self = this;
    var svcchan = self.channel.subChannels[serviceName];
    if (!svcchan && create) {
        self.logger.info('Creating new sub channel', {
            serviceName: serviceName
        });

        svcchan = self.createServiceChannel(serviceName);
    }
    return svcchan;
};

ServiceDispatchHandler.prototype.getServicePeer =
function getServicePeer(serviceName, hostPort) {
    var self = this;
    var svcchan = self.getOrCreateServiceChannel(serviceName);
    return self._getServicePeer(svcchan, hostPort);
};

ServiceDispatchHandler.prototype._getServicePeer =
function _getServicePeer(svcchan, hostPort) {
    var peer = svcchan.peers.get(hostPort);
    if (!peer) {
        peer = svcchan.peers.add(hostPort);
    }
    if (!peer.serviceProxyServices) {
        peer.serviceProxyServices = {};
    }
    peer.serviceProxyServices[svcchan.serviceName] = true;
    return peer;
};

ServiceDispatchHandler.prototype.createServiceChannel =
function createServiceChannel(serviceName) {
    var self = this;

    var exitNodes = self.egressNodes.exitsFor(serviceName);
    var isExit = self.egressNodes.isExitFor(serviceName);
    var mode = isExit ? 'exit' : 'forward';
    var svcchan = self.channel.makeSubChannel({
        serviceName: serviceName
    });
    svcchan.serviceProxyMode = mode; // duck: punched

    if (mode === 'forward') {
        var exitNames = Object.keys(exitNodes);
        for (var i = 0; i < exitNames.length; i++) {
            self._getServicePeer(svcchan, exitNames[i]);
        }
    }

    svcchan.handler = new RelayHandler(svcchan);

    return svcchan;
};

ServiceDispatchHandler.prototype.updateServiceChannels =
function updateServiceChannels() {
    var self = this;
    var serviceNames = Object.keys(self.channel.subChannels);
    for (var i = 0; i < serviceNames.length; i++) {
        var serviceName = serviceNames[i];
        var chan = self.channel.subChannels[serviceName];
        if (chan.serviceProxyMode) {
            self.updateServiceChannel(chan);
        }
    }
};

ServiceDispatchHandler.prototype.updateServiceChannel =
function updateServiceChannel(svcchan) {
    var self = this;
    var exitNodes = self.egressNodes.exitsFor(svcchan.serviceName);
    var isExit = self.egressNodes.isExitFor(svcchan.serviceName);
    if (isExit && svcchan.serviceProxyMode === 'forward') {
        self.changeToExit(exitNodes, svcchan);
    } else if (!isExit) {
        if (svcchan.serviceProxyMode === 'exit') {
            self.changeToForward(exitNodes, svcchan);
        } else {
            self.updateExitNodes(exitNodes, svcchan);
        }
    }
};

ServiceDispatchHandler.prototype.changeToExit =
function changeToExit(exitNodes, svcchan) {
    var self = this;

    var oldMode = svcchan.serviceProxyMode;
    svcchan.serviceProxyMode = 'exit';
    svcchan.peers.clear();
    self.emit('roleTransition', svcchan, {
        oldMode: oldMode,
        newMode: 'exit'
    });

    self.logger.info('Changing to exit node', {
        oldMode: oldMode,
        newMode: 'exit',
        serviceName: svcchan.serviceName
    });
};

ServiceDispatchHandler.prototype.changeToForward =
function changeToForward(exitNodes, svcchan) {
    var self = this;
    var oldMode = svcchan.serviceProxyMode;
    svcchan.serviceProxyMode = 'forward';

    // TODO make sure we close all connections.
    svcchan.peers.clear();
    // TODO: transmit prior known registration data to new owner(s) to
    // speed convergence / deal with transitions better:
    //     var oldPeers = svcchan.peers.clear();
    //     ... send rpc to new exit nodes
    var exitNames = Object.keys(exitNodes);
    for (var i = 0; i < exitNames.length; i++) {
        self._getServicePeer(svcchan, exitNames[i]);
    }
    self.emit('roleTransition', svcchan, {
        oldMode: oldMode,
        newMode: 'forward'
    });

    self.logger.info('Changing to forward node', {
        oldMode: oldMode,
        newMode: 'forward',
        serviceName: svcchan.serviceName
    });
};

ServiceDispatchHandler.prototype.updateExitNodes =
function updateExitNodes(exitNodes, svcchan) {
    var self = this;
    var i;
    var oldNames = svcchan.peers.keys();
    for (i = 0; i < oldNames.length; i++) {
        if (!exitNodes[oldNames[i]]) {
            svcchan.peers.delete(oldNames[i]);
        }
    }
    var exitNames = Object.keys(exitNodes);
    for (i = 0; i < exitNames.length; i++) {
        self._getServicePeer(svcchan, exitNames[i]);
    }
};

// TODO Consider sharding by hostPort and indexing exit exitNodes by hostPort.
// We also have to shard by serviceName and store the serviceName <-> hostPort
// information under the "service exitNodes".  This means that sharding by
// hostPort gives an even spread of socket distribution. i.e. if we shard
// dispatch to 5 exit exitNodes and some small lulzy service to 5 exit
// exitNodes we wont have massive imbalance of dispatch having 500 workers and
// the small service having 2 workers.  We would need two hops to find an exit
// node though

function numberOrDefault(config, key, defaultValue) {
    var value = config.get(key);
    if (typeof value === 'number') {
        return value;
    }
    return defaultValue;
}

module.exports = ServiceDispatchHandler;
