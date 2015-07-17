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

var inherits = require('util').inherits;
var extend = require('xtend');

var TChannelPeersBase = require('./peers_base.js');
var TChannelPeer = require('./peer');
var TChannelSelfPeer = require('./self_peer');

function TChannelPeers(channel, options) {
    if (!(this instanceof TChannelPeers)) {
        return new TChannelPeers(channel, options);
    }
    var self = this;
    TChannelPeersBase.call(self, channel, options);

    self.allocPeerEvent = self.defineEvent('allocPeer');
    self.peerOptions = self.options.peerOptions || {};
    self.peerScoreThreshold = self.options.peerScoreThreshold || 0;
    self.selfPeer = null;
}

inherits(TChannelPeers, TChannelPeersBase);

TChannelPeers.prototype.close = function close(callback) {
    var self = this;

    var peers = self.values();
    if (self.selfPeer) {
        peers.push(self.selfPeer);
    }
    TChannelPeersBase.prototype.close.call(self, peers, callback);
};

TChannelPeers.prototype.sanitySweep = function sanitySweep() {
    var self = this;

    if (self.selfPeer) {
        for (var i = 0; i < self.selfPeer.connections.length; i++) {
            var conn = self.selfPeer.connections[i];
            conn.ops.sanitySweep();
        }
    }
    TChannelPeersBase.prototype.sanitySweep.call(self);
};

TChannelPeers.prototype.add = function add(hostPort, options) {
    /*eslint max-statements: [2, 25]*/
    var self = this;

    var peer = self._map[hostPort];
    if (peer) {
        return peer;
    }

    var topChannel = self.channel.topChannel || self.channel;

    if (hostPort === topChannel.hostPort) {
        if (!topChannel.peers.selfPeer) {
            topChannel.peers.selfPeer = TChannelSelfPeer(topChannel);
        }

        return topChannel.peers.selfPeer;
    }

    if (self.channel.topChannel) {
        peer = self.channel.topChannel.peers.add(hostPort, options);
    } else {
        options = options || extend({}, self.peerOptions);
        peer = TChannelPeer(self.channel, hostPort, options);
        self.allocPeerEvent.emit(self, peer);
    }

    self._map[hostPort] = peer;
    self._keys.push(hostPort);

    return peer;
};

TChannelPeers.prototype.clear = function clear() {
    var self = this;

    if (self.channel.subChannels) {
        var names = Object.keys(self.channel.subChannels);
        for (var i = 0; i < names.length; i++) {
            var subChannel = self.channel.subChannels[names[i]];
            subChannel.peers._map = Object.create(null);
            subChannel.peers._keys = [];
        }
    }
    self._map = Object.create(null);
    self._keys = [];
};

TChannelPeers.prototype._delete = function _del(peer) {
    var self = this;

    if (self.channel.subChannels) {
        var names = Object.keys(self.channel.subChannels);
        for (var i = 0; i < names.length; i++) {
            var subChannel = self.channel.subChannels[names[i]];
            subChannel.peers.delete(peer.hostPort);
        }
    }
    delete self._map[peer.hostPort];
    var index = self._keys.indexOf(peer.hostPort);
    self._keys.splice(index, 1);
};

TChannelPeers.prototype.choosePeer = function choosePeer(req) {
    /*eslint complexity: [2, 15]*/
    var self = this;

    if (!self.channel.topChannel) {
        return null;
    }

    var hosts = self._keys;
    if (!hosts || !hosts.length) {
        return null;
    }

    var threshold = self.peerScoreThreshold;

    var selectedPeer = null;
    var selectedScore = 0;
    for (var i = 0; i < hosts.length; i++) {
        var hostPort = hosts[i];
        var peer = self._map[hostPort];
        if (!req || !req.triedRemoteAddrs[hostPort]) {
            var score = peer.state.shouldRequest(req);
            var want = score > threshold &&
                       (selectedPeer === null || score > selectedScore);
            if (want) {
                selectedPeer = peer;
                selectedScore = score;
            }
        }
    }
    return selectedPeer;
};

module.exports = TChannelPeers;
