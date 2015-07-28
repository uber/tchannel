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

var TChannelPeersBase = require('./peers_base.js');
var PeerHeap = require('./peer_heap.js');

function TChannelSubPeers(channel, options) {
    if (!(this instanceof TChannelSubPeers)) {
        return new TChannelSubPeers(channel, options);
    }
    var self = this;
    TChannelPeersBase.call(self, channel, options);

    self.peerScoreThreshold = self.options.peerScoreThreshold || 0;
    self._heap = new PeerHeap();
    self.choosePeerWithHeap = channel.choosePeerWithHeap;
}

inherits(TChannelSubPeers, TChannelPeersBase);

TChannelSubPeers.prototype.close = function close(callback) {
    var self = this;

    var peers = self.values();
    TChannelPeersBase.prototype.close.call(self, peers, callback);
};

TChannelSubPeers.prototype.add = function add(hostPort, options) {
    /* eslint max-statements: [2, 25]*/
    var self = this;

    var peer = self._map[hostPort];
    if (peer) {
        return peer;
    }

    var topChannel = self.channel.topChannel;

    if (hostPort === topChannel.hostPort) {
        return topChannel.peers.getSelfPeer();
    }

    peer = topChannel.peers.add(hostPort, options);

    self._map[hostPort] = peer;
    self._keys.push(hostPort);

    var el = self._heap.add(peer);
    peer.heapElements.push(el);

    return peer;
};

TChannelSubPeers.prototype.clear = function clear() {
    var self = this;

    self._map = Object.create(null);
    self._keys = [];
    self._heap.clear();
};

TChannelSubPeers.prototype._delete = function _del(peer) {
    var self = this;

    delete self._map[peer.hostPort];
    var index = self._keys.indexOf(peer.hostPort);
    popout(self._keys, index);

    for (var i = 0; i < peer.heapElements.length; i++) {
        var el = peer.heapElements[i];
        if (el.heap === self._heap) {
            el.heap.remove(el.index);
            popout(peer.heapElements, i);
            break;
        }
    }
};

TChannelSubPeers.prototype.choosePeer = function choosePeer(req) {
    var self = this;

    if (self.choosePeerWithHeap) {
        return self.chooseHeapPeer(req);
    }

    return self.chooseLinearPeer(req);
};

TChannelSubPeers.prototype.chooseLinearPeer = function chooseLinearPeer(req) {
    /* eslint complexity: [2, 15]*/
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
        if (!req || !req.triedRemoteAddrs || !req.triedRemoteAddrs[hostPort]) {
            var score = peer.handler.getScore(req);
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

TChannelSubPeers.prototype.chooseHeapPeer = function chooseHeapPeer(req) {
    var self = this;

    if (req && req.triedRemoteAddrs) {
        return self._choosePeerSkipTried(req);
    }

    return self._heap.choose(self.peerScoreThreshold);
};

TChannelSubPeers.prototype._choosePeerSkipTried =
function _choosePeerSkipTried(req) {
    var self = this;

    return self._heap.choose(self.peerScoreThreshold, filterTriedPeers);

    function filterTriedPeers(peer) {
        return !req.triedRemoteAddrs[peer.hostPort];
    }
};

function popout(array, i) {
    if (!array.length) {
        return;
    }

    var j = array.length - 1;
    if (i !== j) {
        var tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
    }
    array.pop();
}

module.exports = TChannelSubPeers;
