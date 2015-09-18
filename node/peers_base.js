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
var EventEmitter = require('./lib/event_emitter');

function TChannelPeersBase(channel, options) {
    var self = this;
    EventEmitter.call(self);

    self.channel = channel;
    self.logger = self.channel.logger;
    self.options = options || {};
    self._map = Object.create(null);
    self._keys = [];
    self.preferConnectionDirection = self.options.preferConnectionDirection || 'any';
}

inherits(TChannelPeersBase, EventEmitter);

TChannelPeersBase.prototype.close = function close(peers, callback) {
    var self = this;

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

TChannelPeersBase.prototype.sanitySweep = function sanitySweep() {
    var self = this;

    var peers = self.values();
    for (var i = 0; i < peers.length; i++) {
        var peer = peers[i];
        for (var j = 0; j < peer.connections.length; j++) {
            var conn = peer.connections[j];
            conn.ops.sanitySweep();
        }
    }
};

TChannelPeersBase.prototype.get = function get(hostPort) {
    var self = this;

    return self._map[hostPort] || null;
};

TChannelPeersBase.prototype.keys = function keys() {
    var self = this;

    return self._keys.slice();
};

TChannelPeersBase.prototype.values = function values() {
    var self = this;

    var keys = self._keys;
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = self._map[keys[i]];
    }

    return ret;
};

TChannelPeersBase.prototype.entries = function entries() {
    var self = this;

    var keys = self._keys;
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = [keys[i], self._map[keys[i]]];
    }
    return ret;
};

TChannelPeersBase.prototype.delete = function del(hostPort) {
    var self = this;
    var peer = self._map[hostPort];

    if (!peer) {
        return;
    }

    self._delete(peer);

    return peer;
};

module.exports = TChannelPeersBase;
