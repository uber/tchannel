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
var ScoredMaxHeap = require('./scored_max_heap');

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
    self._heap = new ScoredMaxHeap();
    self.selfPeer = null;
}

inherits(TChannelPeers, EventEmitter);

// TODO: need to drive out of band rescoring (probably timer driven from one
// timer on the root channel)

TChannelPeers.prototype.rescore = function rescore() {
    var self = this;
    for (var i = 0; i < self._heap.items.length; i++) {
        var peer = self._heap.items[i];
        var score = peer.state.shouldRequest();
        self._heap.scores[i] = score;
    }
    self._heap.heapify();
};

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

        var score = peer.state.shouldRequest();
        self._map[hostPort] = peer;
        self._keys.push(hostPort);
        self._heap.push(peer, score);
    }
    return peer;
};

TChannelPeers.prototype.addPeer = function addPeer(peer) {
    var self = this;
    assert(peer instanceof TChannelPeer, 'invalid peer');
    assert(!self._map[peer.hostPort], 'peer already defined');
    if (peer.hostPort !== self.channel.hostPort) {
        var score = peer.state.shouldRequest();
        self._map[peer.hostPort] = peer;
        self._keys.push(peer.hostPort);
        self._heap.push(peer, score);
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
    self._heap = new ScoredMaxHeap();
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
    self._keys.splice(index, 1); // TODO: such splice
    var heapIndex = self._heap.items.indexOf(peer);
    self._heap.remove(heapIndex);

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

    if (self._heap.scores[0] <= threshold) { // TODO: why inclusive?
        return null;
    }

    var peer = self._heap.items[0];
    // TODO: this could be deferred:
    // - store a pendingRescore bit
    // - set a next tick to rescore and clear bit
    // - if asked to choose a peer while pendingRescore is still set, take the
    //   hit and rescore then (do not clear bit)
    //
    // However such cleverness might just slow down the throughput of a very
    // busy server rather than help.

    var score = peer.state.shouldRequest();
    self._heap.scores[0] = score;
    self._heap.siftdown(0);

    return peer;
};

module.exports = TChannelPeers;
