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
var EventEmitter = require('../lib/event_emitter');
var util = require('util');
var ServiceHealthProxy = require('./service_health_proxy');

var DEFAULT_LOG_GRACE_PERIOD = 5 * 60 * 1000;
var SERVICE_PURGE_PERIOD = 5 * 60 * 1000;

function ServiceDispatchHandler(options) {
    if (!(this instanceof ServiceDispatchHandler)) {
        return new ServiceDispatchHandler(options);
    }
    var self = this;

    EventEmitter.call(self);
    self.roleTransitionEvent = self.defineEvent('roleTransition');

    assert(options, 'service dispatch handler options not actually optional');
    self.channel = options.channel;
    self.logger = options.logger;
    self.statsd = options.statsd;
    self.egressNodes = options.egressNodes;
    self.createdAt = self.channel.timers.now();
    self.logGracePeriod = options.logGracePeriod ||
        DEFAULT_LOG_GRACE_PERIOD;
    self.permissionsCache = options.permissionsCache;
    self.serviceReqDefaults = options.serviceReqDefaults || {};
    self.circuits = options.circuits;
    self.servicePurgePeriod = options.servicePurgePeriod ||
        SERVICE_PURGE_PERIOD;
    self.exitServices = Object.create(null);
    self.purgeServices();

    self.egressNodes.on('membershipChanged', onMembershipChanged);
    self.outRelayRequests = {};

    function onMembershipChanged() {
        self.updateServiceChannels();
    }
}

util.inherits(ServiceDispatchHandler, EventEmitter);

ServiceDispatchHandler.prototype.type = 'tchannel.hyperbahn.service-dispatch-handler';

ServiceDispatchHandler.prototype.forwardFrame =
function forwardFrame(conn, buffer, type) {
    var self = this;

    // 4 cases
    if (type === 0x03) {
        self.forwardCallReq(conn, buffer);
    } else if (type === 0x04) {
        self.forwardCallRes(conn, buffer);
    } else if (type === 0x13) {
        self.forwardCallReqCont(conn, buffer);
    } else if (type === 0x14) {
        self.forwardCallResCont(conn, buffer);
    } else if (type === 0xff) {
        self.forwardErrorFrame(conn, buffer);
    }
};

ServiceDispatchHandler.prototype.forwardCallReq =
function forwardCallReq(conn, buffer) {
    var self = this;

    var serviceLength = buffer.readUInt8(46);
    var serviceName = buffer.toString('utf8', 47, 47 + serviceLength);

    var chan = self.channel.subChannels[serviceName];
    assert(chan, 'channel must always exist');

    var forwardReq = new ForwardOutReq(
        self, conn, buffer, serviceName, chan
    );
    forwardReq.forwardRequest();
};

function ForwardOutReq(handler, conn, buffer, serviceName, subChannel) {
    var self = this;

    self.serviceDispatchHandler = handler;
    self.buffer = buffer;
    self.serviceName = serviceName;
    self.subChannel = subChannel;
    self.incomingConnection = conn;

    self.inId = buffer.readUInt32BE(4);
    self.outId = null;
    self.peer = null;
    self.forwardConn = null;
}

ForwardOutReq.prototype.forwardRequest = function forwardRequest() {
    var self = this;

    self.peer = self.subChannel.peers.choosePeer();
    assert(self.peer, 'peer must exist');

    self.peer.waitForIdentified(onIdentified);

    function onIdentified(err) {
        self.onIdentified(err);
    }
};

function chooseRelayPeerConnection(peer) {
    var conn = null;
    for (var i = 0; i < peer.connections.length; i++) {
        conn = peer.connections[i];
        if (conn.remoteName && !conn.closing) {
            break;
        }
    }
    return conn;
}

ForwardOutReq.prototype.onIdentified = function onIdentified(err) {
    var self = this;

    assert(!err, 'cannot fail identification');
    self.forwardConn = chooseRelayPeerConnection(self.peer);

    self.outId = self.forwardConn.nextFrameId();
    self.serviceDispatchHandler.outRelayRequests[
        self.forwardConn.guid + String(self.outId)
    ] = self;

    self.buffer.writeUInt32BE(self.outId, 4);
    self.forwardConn.socket.write(self.buffer);
};

ServiceDispatchHandler.prototype.forwardCallRes =
function forwardCallRes(conn, buffer) {
    var self = this;

    var frameId = buffer.readUInt32BE(4);
    var reqKey = conn.guid + String(frameId);

    var relayOutReq = self.outRelayRequests[reqKey];
    assert(relayOutReq, 'relay out req must always exist');

    delete self.outRelayRequests[reqKey];
    buffer.writeUInt32BE(relayOutReq.inId, 4);

    relayOutReq.incomingConnection.socket.write(buffer);
};

ServiceDispatchHandler.prototype.forwardCallReqCont =
function forwardCallReqCont(conn, buffer) {
    throw new Error('Not Implemented');
};

ServiceDispatchHandler.prototype.forwardCallResCont =
function forwardCallResCont(conn, buffer) {
    throw new Error('Not Implemented');
};

ServiceDispatchHandler.prototype.forwardErrorFrame =
function forwardErrorFrame(conn, buffer) {
    console.log('you wat m8', buffer.toString());
    throw new Error('Not Implemented');
};

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

    if (self.isBlocked(req.headers && req.headers.cn, req.serviceName)) {
        req.connection.ops.popInReq(req.id);
        return;
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
        var now = self.channel.timers.now();
        if (now >= self.createdAt + self.logGracePeriod) {
            self.logger.info('Creating new sub channel', {
                serviceName: serviceName
            });
        }

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

    var options = {
        serviceName: serviceName
    };
    if (self.serviceReqDefaults[serviceName]) {
        options.requestDefaults = self.serviceReqDefaults[serviceName];
    }

    var svcchan = self.channel.makeSubChannel(options);
    svcchan.serviceProxyMode = mode; // duck: punched

    if (mode === 'forward') {
        var exitNames = Object.keys(exitNodes);
        for (var i = 0; i < exitNames.length; i++) {
            self._getServicePeer(svcchan, exitNames[i]);
        }
    }

    var handler = new RelayHandler(svcchan);

    // Decorate a circuit health monitor to egress request handlers.
    if (mode === 'exit' && self.circuits) {
        handler = new ServiceHealthProxy({
            nextHandler: handler,
            circuits: self.circuits
        });
    }

    svcchan.handler = handler;

    return svcchan;
};

ServiceDispatchHandler.prototype.purgeServices =
function purgeServices() {
    var self = this;

    var time = self.channel.timers.now();
    var keys = Object.keys(self.exitServices);
    for (var i = 0; i < keys.length; i++) {
        var serviceName = keys[i];
        if (time - self.exitServices[serviceName] > self.servicePurgePeriod) {
            delete self.exitServices[serviceName];
            var chan = self.channel.subChannels[serviceName];
            if (chan) {
                chan.close();
                delete self.channel.subChannels[serviceName];
            }
        }
    }

    self.servicePurgeTimer = self.channel.timers.setTimeout(
        function purgeServices() {
            self.purgeServices();
        },
        self.servicePurgePeriod
    );
};

ServiceDispatchHandler.prototype.refreshServicePeer =
function refreshServicePeer(serviceName, hostPort) {
    var self = this;

    var peer = self.getServicePeer(serviceName, hostPort);
    peer.connect();

    var time = self.channel.timers.now();
    self.exitServices[serviceName] = time;
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

    if (self.circuits) {
        self.circuits.updateServices();
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
    self.roleTransitionEvent.emit(self, {
        svcchan: svcchan,
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
    self.roleTransitionEvent.emit(self, {
        svcchan: svcchan,
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

ServiceDispatchHandler.prototype.isBlocked =
function isBlocked(cn, serviceName) {
    var self = this;
    if (!self.blockingTable) {
        return false;
    }

    cn = cn || '*';
    serviceName = serviceName || '*';

    if (self.blockingTable[cn + '~~' + serviceName] ||
        self.blockingTable['*~~' + serviceName] ||
        self.blockingTable[cn + '~~*']) {
        return true;
    }

    return false;
};

ServiceDispatchHandler.prototype.block =
function block(cn, serviceName) {
    var self = this;
    cn = cn || '*';
    serviceName = serviceName || '*';
    self.blockingTable = self.blockingTable || {};
    assert(cn !== '*' || serviceName !== '*', 'at least one of cn/serviceName should be provided');
    self.blockingTable[cn + '~~' + serviceName] = Date.now();
};

ServiceDispatchHandler.prototype.unblock =
function unblock(cn, serviceName) {
    var self = this;
    if (!self.blockingTable) {
        return;
    }

    cn = cn || '*';
    serviceName = serviceName || '*';
    delete self.blockingTable[cn + '~~' + serviceName];
    if (Object.keys(self.blockingTable).length === 0) {
        self.blockingTable = null;
    }
};

ServiceDispatchHandler.prototype.destroy =
function destroy() {
    var self = this;
    self.channel.timers.clearTimeout(self.servicePurgeTimer);
};

// TODO Consider sharding by hostPort and indexing exit exitNodes by hostPort.
// We also have to shard by serviceName and store the serviceName <-> hostPort
// information under the "service exitNodes".  This means that sharding by
// hostPort gives an even spread of socket distribution. i.e. if we shard
// dispatch to 5 exit exitNodes and some small lulzy service to 5 exit
// exitNodes we wont have massive imbalance of dispatch having 500 workers and
// the small service having 2 workers.  We would need two hops to find an exit
// node though

module.exports = ServiceDispatchHandler;
