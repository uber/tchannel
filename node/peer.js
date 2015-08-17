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
var inherits = require('util').inherits;
var EventEmitter = require('./lib/event_emitter');
var net = require('net');

var TChannelConnection = require('./connection');
var errors = require('./errors');
var Request = require('./request');

var DEFAULT_REPORT_INTERVAL = 1000;

function TChannelPeer(channel, hostPort, options) {
    if (!(this instanceof TChannelPeer)) {
        return new TChannelPeer(channel, hostPort, options);
    }
    var self = this;
    EventEmitter.call(self);

    self.stateChangedEvent = self.defineEvent('stateChanged');
    self.allocConnectionEvent = self.defineEvent('allocConnection');

    assert(hostPort !== '0.0.0.0:0', 'Cannot create ephemeral peer');

    self.channel = channel;
    self.logger = self.channel.logger;
    self.timers = self.channel.timers;
    self.random = self.channel.random;
    self.options = options || {};
    self.hostPort = hostPort;
    self.connections = [];
    self.pendingIdentified = 0;
    self.heapElements = [];
    self.handler = new PreferOutgoingHandler(self);

    self.reportInterval = self.options.reportInterval || DEFAULT_REPORT_INTERVAL;
    if (self.reportInterval > 0 && self.channel.emitConnectionMetrics) {
        self.reportTimer = self.timers.setTimeout(
            onReport, self.reportInterval
        );
    }

    function onReport() {
        if (!self.hostPort) {
            return;
        }

        var count = self.countConnections('out');
        if (self.channel.emitConnectionMetrics) {
            self.channel.connectionsActiveStat.update(count, {
                'host-port': self.channel.hostPort,
                'peer-host-port': self.hostPort
            });
        }

        self.reportTimer = self.timers.setTimeout(
            onReport, self.reportInterval
        );
    }
}

inherits(TChannelPeer, EventEmitter);

TChannelPeer.prototype.invalidateScore = function invalidateScore() {
    var self = this;

    if (!self.heapElements.length) {
        return;
    }

    var score = self.handler.getScore();
    for (var i = 0; i < self.heapElements.length; i++) {
        var el = self.heapElements[i];
        el.rescore(score);
    }
};

TChannelPeer.prototype.isConnected = function isConnected(direction, identified) {
    var self = this;

    if (identified === undefined) identified = true;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (direction && conn.direction !== direction) {
            continue;
        } else if (conn.closing) {
            continue;
        } else if (conn.remoteName !== null || !identified) {
            return true;
        }
    }

    return false;
};

TChannelPeer.prototype.close = function close(callback) {
    var self = this;

    if (self.reportTimer) {
        self.timers.clearTimeout(self.reportTimer);
        self.reportTimer = null;
    }

    var counter = self.connections.length;
    if (counter) {
        self.connections.forEach(function eachConn(conn) {
            conn.close(onClose);
        });
    } else {
        callback(null);
    }
    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more peer sockets than expected', {
                    counter: counter
                });
            }
            callback(null);
        }
    }
};

TChannelPeer.prototype.getInConnection = function getInConnection() {
    var self = this;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (!conn.closing) return conn;
    }
    return null;
};

TChannelPeer.prototype.getOutConnection = function getOutConnection(preferIdentified) {
    var self = this;
    var candidate = null;
    for (var i = self.connections.length - 1; i >= 0; i--) {
        var conn = self.connections[i];
        if (conn.closing) continue;
        if (!preferIdentified) return conn; // user doesn't care, take last outgoing
        if (conn.remoteName) return conn; // user wanted an identified channel, and we found one
        if (!candidate) candidate = conn; // we'll fallback to returning this if we can't find an identified one
    }
    return candidate;
};

TChannelPeer.prototype.getIdentifiedOutConnection = function getIdentifiedOutConnection() {
    var self = this;
    return self.getOutConnection(true);
};

TChannelPeer.prototype.countConnections = function countConnections(direction) {
    var self = this;
    if (!direction) {
        return self.connections.length;
    }

    var count = 0;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (conn.direction === direction) {
            count++;
        }
    }

    return count;
};

TChannelPeer.prototype.connect = function connect(outOnly) {
    var self = this;
    var conn = self.getIdentifiedOutConnection();
    if (!conn || (outOnly && conn.direction !== 'out')) {
        var socket = self.makeOutSocket();
        conn = self.makeOutConnection(socket);
        self.addConnection(conn);
    }
    return conn;
};

TChannelPeer.prototype.waitForIdentified =
function waitForIdentified(callback) {
    var self = this;

    var conn = self.connect();

    if (conn.closing) {
        callback(conn.closeError);
    } else if (conn.remoteName) {
        callback(null);
    } else {
        self._waitForIdentified(conn, callback);
    }
};

TChannelPeer.prototype._waitForIdentified =
function _waitForIdentified(conn, callback) {
    var self = this;

    self.pendingIdentified++;
    conn.errorEvent.on(onConnectionError);
    conn.closeEvent.on(onConnectionClose);
    conn.identifiedEvent.on(onIdentified);
    self.invalidateScore();

    function onConnectionError(err) {
        finish(err);
    }

    function onConnectionClose(err) {
        finish(err);
    }

    function onIdentified() {
        finish(null);
    }

    function finish(err) {
        self.pendingIdentified = 0;
        conn.errorEvent.removeListener(onConnectionError);
        conn.closeEvent.removeListener(onConnectionClose);
        conn.identifiedEvent.removeListener(onIdentified);
        self.invalidateScore();
        callback(err);
    }
};

TChannelPeer.prototype.request = function peerRequest(options) {
    var self = this;
    options.timeout = options.timeout || Request.defaultTimeout;
    return self.connect().request(options);
};

TChannelPeer.prototype.addConnection = function addConnection(conn) {
    var self = this;
    // TODO: first approx alert for self.connections.length > 2
    // TODO: second approx support pruning
    if (conn.direction === 'out') {
        self.connections.push(conn);
    } else {
        self.connections.unshift(conn);
    }
    conn.errorEvent.on(onConnectionError);
    conn.closeEvent.on(onConnectionClose);

    self._maybeInvalidateScore();
    if (!conn.remoteName) {
        // TODO: could optimize if handler had a way of saying "would a new
        // identified connection change your Tier?"
        conn.identifiedEvent.on(onIdentified);
    }

    return conn;

    function onIdentified() {
        conn.identifiedEvent.removeListener(onIdentified);
        self._maybeInvalidateScore();
    }

    function onConnectionError(err) {
        removeConnection(err);
    }

    function onConnectionClose() {
        removeConnection(null);
    }

    function removeConnection(err) {
        conn.closeEvent.removeListener(onConnectionClose);
        conn.errorEvent.removeListener(onConnectionError);
        conn.identifiedEvent.removeListener(onIdentified);
        if (err) {
            var loggerInfo = {
                error: err,
                direction: conn.direction,
                remoteName: conn.remoteName,
                socketRemoteAddr: conn.socketRemoteAddr
            };

            var codeName = errors.classify(err);
            if (codeName === 'Timeout') {
                self.logger.warn('Got a connection error', loggerInfo);
            } else {
                self.logger.error('Got an unexpected connection error', loggerInfo);
            }
        }

        self.removeConnection(conn);
    }
};

TChannelPeer.prototype.removeConnection = function removeConnection(conn) {
    var self = this;

    var ret = null;

    var index = self.connections ? self.connections.indexOf(conn) : -1;
    if (index !== -1) {
        ret = self.connections.splice(index, 1)[0];
    }

    self._maybeInvalidateScore();

    return ret;
};

TChannelPeer.prototype.makeOutSocket = function makeOutSocket() {
    var self = this;
    var parts = self.hostPort.split(':');
    assert(parts.length === 2, 'invalid destination');
    var host = parts[0];
    var port = parts[1];
    assert(host !== '0.0.0.0', 'cannot connect to ephemeral peer');
    assert(port !== '0', 'cannot connect to dynamic port');
    var socket = net.createConnection({host: host, port: port});
    return socket;
};

TChannelPeer.prototype.makeOutConnection = function makeOutConnection(socket) {
    var self = this;
    var chan = self.channel.topChannel || self.channel;
    var conn = new TChannelConnection(chan, socket, 'out', self.hostPort);
    self.allocConnectionEvent.emit(self, conn);
    return conn;
};

TChannelPeer.prototype.countOutPending = function countOutPending() {
    var self = this;
    var pending = 0;
    for (var index = 0; index < self.connections.length; index++) {
        var connPending = self.connections[index].ops.getPending();

        pending += connPending.out;
    }
    return pending;
};

// TODO: on connection #getScore impacting event
// - on identified

// Called on connection change event
TChannelPeer.prototype._maybeInvalidateScore = function _maybeInvalidateScore() {
    var self = this;

    if (self.handler.getTier() !== self.handler.lastTier) {
        self.invalidateScore();
    }
};

TChannelPeer.prototype.getScore = function getScore() {
    var self = this;
    return self.handler.getScore();
};

var TIER_UNCONNECTED = 0;
var TIER_ONLY_INCOMING = 1;
var TIER_FRESH_OUTGOING = 2;
var TIER_READY_OUTGOING = 3;

function PreferOutgoingHandler(peer) {
    var self = this;

    self.peer = peer;
    self.lastTier = self.getTier();
}

PreferOutgoingHandler.prototype.getTier = function getTier() {
    var self = this;

    var inconn = self.peer.getInConnection();
    var outconn = self.peer.getIdentifiedOutConnection();

    if (!inconn && !outconn) {
        return TIER_UNCONNECTED;
    } else if (!outconn || outconn.direction !== 'out') {
        return TIER_ONLY_INCOMING;
    } else if (outconn.remoteName === null) {
        return TIER_FRESH_OUTGOING;
    } else {
        return TIER_READY_OUTGOING;
    }
};

PreferOutgoingHandler.prototype.getScore = function getScore() {
    var self = this;

    // domain, per tier of availability:
    //   [0.1, 0.4)  peers with no identified outgoing connection
    //   [0.4, 1.0)  identified outgoing connections

    // within each domain, the score is a function of the number of pending
    // requests. 1 for 0 pending, 1/2 for 1 pending, 1/3 for 2 pending, etc.
    var pending = self.peer.pendingIdentified + self.peer.countOutPending();
    var pendingScore = 1 / (1 + pending);

    var tier = self.getTier();
    self.lastTier = tier;
    switch (tier) {
        case TIER_ONLY_INCOMING:
            if (!self.peer.channel.destroyed) {
                self.peer.connect();
            }
            /* falls through */
        case TIER_UNCONNECTED:
            /* falls through */
        case TIER_FRESH_OUTGOING:
            return 0.1 + pendingScore * 0.3;
        case TIER_READY_OUTGOING:
            return 0.4 + pendingScore * 0.6;
    }
};

module.exports = TChannelPeer;
