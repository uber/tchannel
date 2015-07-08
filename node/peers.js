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
var extend = require('xtend');
var EventEmitter = require('./lib/event_emitter');

var TChannelPeer = require('./peer');
var TChannelSelfPeer = require('./self_peer');

function TChannelPeers(channel, options) {
    if (!(this instanceof TChannelPeers)) {
        return new TChannelPeers(channel, options);
    }
    var self = this;
    EventEmitter.call(self);
    self.allocPeerEvent = self.defineEvent('allocPeer');

    self.channel = channel;
    self.logger = self.channel.logger;
    self.options = options || {};
    self.peerOptions = self.options.peerOptions || {};
    self.peerScoreThreshold = self.options.peerScoreThreshold || 0;
    self._map = Object.create(null);
    self._keys = [];
    self.selfPeer = null;
}

inherits(TChannelPeers, EventEmitter);

TChannelPeers.prototype.close = function close(callback) {
    var self = this;

    var peers = self.values();
    if (self.selfPeer) {
        peers.push(self.selfPeer);
    }
    var counter = peers.length + 1;
    peers.forEach(function eachPeer(peer) {
        peer.close(onClose);
    });
    self.clear();
    onClose();

    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more peers than expected', {
                    counter: counter
                });
            }
            callback();
        }
    }
};

TChannelPeers.prototype.get = function get(hostPort) {
    var self = this;
    return self._map[hostPort] || null;
};

TChannelPeers.prototype.add = function add(hostPort, options) {
    var self = this;
    var peer = self._map[hostPort];
    if (!peer) {
        if (hostPort === self.channel.hostPort) {
            if (!self.selfPeer) {
                self.selfPeer = TChannelSelfPeer(self.channel);
            }

            return self.selfPeer;
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
    }
    return peer;
};

TChannelPeers.prototype.addPeer = function addPeer(peer) {
    var self = this;
    assert(peer instanceof TChannelPeer, 'invalid peer');
    assert(!self._map[peer.hostPort], 'peer already defined');
    if (peer.hostPort !== self.channel.hostPort) {
        self._map[peer.hostPort] = peer;
        self._keys.push(peer.hostPort);
    }
};

TChannelPeers.prototype.keys = function keys() {
    var self = this;
    return self._keys.slice();
};

TChannelPeers.prototype.values = function values() {
    var self = this;
    var keys = self._keys;
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = self._map[keys[i]];
    }
    return ret;
};

TChannelPeers.prototype.entries = function entries() {
    var self = this;
    var keys = self._keys;
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = [keys[i], self._map[keys[i]]];
    }
    return ret;
};

TChannelPeers.prototype.clear = function clear() {
    var self = this;
    var keys = self.keys();
    var vals = new Array(keys.length);
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
    return vals;
};

TChannelPeers.prototype.delete = function del(hostPort) {
    var self = this;
    var peer = self._map[hostPort];

    if (!peer) {
        return;
    }

    if (self.channel.subChannels) {
        var names = Object.keys(self.channel.subChannels);
        for (var i = 0; i < names.length; i++) {
            var subChannel = self.channel.subChannels[names[i]];
            subChannel.peers.delete(hostPort);
        }
    }
    delete self._map[hostPort];
    var index = self._keys.indexOf(hostPort);
    self._keys.splice(index, 1);

    return peer;
};

TChannelPeers.prototype.waitForIdentified =
function waitForIdentified(options, callback) {
    var self = this;

    assert(typeof options.host === 'string', 'options.host is required');

    var peer = self.add(options.host);
    peer.waitForIdentified(callback);
};

TChannelPeers.prototype.choosePeer =
function choosePeer(req) {
    /*eslint complexity: [2, 15]*/
    var self = this;

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
