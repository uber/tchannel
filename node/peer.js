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
var PreferOutgoing = require('./peer_score_strategies.js').PreferOutgoing;

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
    self.handler = null;

    self.reportInterval = self.options.reportInterval || DEFAULT_REPORT_INTERVAL;
    if (self.reportInterval > 0 && self.channel.emitConnectionMetrics) {
        self.reportTimer = self.timers.setTimeout(
            onReport, self.reportInterval
        );
    }

    self.setScoreStrategy(PreferOutgoing);

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

TChannelPeer.prototype.setScoreStrategy = function setScoreStrategy(ScoreStrategy) {
    var self = this;

    self.handler = new ScoreStrategy(self);
};

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

// ensures that a connection exists
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

// ensures that an outbound connection exists
TChannelPeer.prototype.connectTo = function connectTo() {
    var self = this;
    self.connect(true);
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

TChannelPeer.prototype.outPendingWeightedRandom = function outPendingWeightedRandom() {
    // Returns a score in the range from 0 to 1, where it is preferable to use
    // a peer with a higher score over one with a lower score.
    // This range is divided among an infinite set of subranges corresponding
    // to peers with the same number of pending requests.
    // So, the range (1/2, 1) is reserved for peers with 0 pending connections.
    // The range (1/4, 1/2) is reserved for peers with 1 pending connections.
    // The range (1/8, 1/4) is reserved for peers with 2 pending connections.
    // Ad nauseam.
    // Within each equivalence class, each peer receives a uniform random
    // value.
    //
    // The previous score was a weighted random variable:
    //   random() ** (1 + pending)
    // This had the attribute that a less loaded peer was merely more likely to
    // be chosen over a more loaded peer.
    // We observed with the introduction of a heap, that a less favored peer
    // would have its score less frequently re-evaluated.
    // An emergent behavior was that scores would, over time, be squeezed
    // toward zero and the least favored peer would remain the least favored
    // for ever increasing durations.
    //
    // This remains true with this algorithm, within each equivalence class.
    var self = this;
    var pending = self.pendingIdentified + self.countOutPending();
    var max = Math.pow(0.5, pending);
    var min = max / 2;
    var diff = max - min;
    return min + diff * self.random();
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

module.exports = TChannelPeer;
