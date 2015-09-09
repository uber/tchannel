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

module.exports.PreferOutgoing = PreferOutgoing;

function PreferOutgoing(peer) {
    var self = this;

    self.peer = peer;
    self.lastTier = self.getTier();
}

PreferOutgoing.UNCONNECTED = 0;
PreferOutgoing.ONLY_INCOMING = 1;
PreferOutgoing.FRESH_OUTGOING = 2;
PreferOutgoing.READY_OUTGOING = 3;

PreferOutgoing.prototype.getTier = function getTier() {
    var self = this;

    var inconn = self.peer.getInConnection();
    var outconn = self.peer.getIdentifiedOutConnection();

    if (!inconn && !outconn) {
        return PreferOutgoing.UNCONNECTED;
    } else if (!outconn || outconn.direction !== 'out') {
        return PreferOutgoing.ONLY_INCOMING;
    } else if (outconn.remoteName === null) {
        return PreferOutgoing.FRESH_OUTGOING;
    } else {
        return PreferOutgoing.READY_OUTGOING;
    }
};

PreferOutgoing.prototype.getScore = function getScore() {
    var self = this;

    // TODO: support pruning old incoming conns

    // space:
    //   [0.1, 0.4)  peers with no identified outgoing connection
    //   [0.4, 1.0)  identified outgoing connections
    var random = self.peer.outPendingWeightedRandom();
    var tier = self.getTier();
    self.lastTier = tier;
    switch (tier) {
        case PreferOutgoing.ONLY_INCOMING:
            if (!self.peer.channel.destroyed) {
                self.peer.connectTo();
            }
            /* falls through */
        case PreferOutgoing.UNCONNECTED:
            /* falls through */
        case PreferOutgoing.FRESH_OUTGOING:
            return 0.1 + random * 0.3;
        case PreferOutgoing.READY_OUTGOING:
            return 0.4 + random * 0.6;
    }
};

module.exports.PreferIncoming = PreferIncoming;

function PreferIncoming(peer) {
    var self = this;

    self.peer = peer;
    self.lastTier = self.getTier();
}

PreferIncoming.UNCONNECTED = 0;
PreferIncoming.ONLY_OUTGOING = 1;
PreferIncoming.FRESH_INCOMING = 2;
PreferIncoming.READY_INCOMING = 3;

PreferIncoming.prototype.getTier = function getTier() {
    var self = this;

    var inconn = self.peer.getInConnection();
    var outconn = self.peer.getOutConnection();

    if (!inconn && !outconn) {
        return PreferIncoming.UNCONNECTED;
    } else if (!inconn || inconn.direction !== 'in') {
        return PreferIncoming.ONLY_OUTGOING;
    } else if (inconn.remoteName === null) {
        return PreferIncoming.FRESH_INCOMING;
    } else {
        return PreferIncoming.READY_INCOMING;
    }
};

PreferIncoming.prototype.shouldRequest = function shouldRequest() {
    var self = this;

    // TODO: support pruning old outgoing conns

    // space:
    //   [0.1, 0.4)  peers with no identified incoming connection
    //   [0.4, 1.0)  identified incoming connections
    var random = self.peer.outPendingWeightedRandom();
    var tier = self.getTier();
    self.lastTier = tier;
    switch (tier) {
        case PreferIncoming.ONLY_OUTGOING:
            /* falls through */
        case PreferIncoming.UNCONNECTED:
            /* falls through */
        case PreferIncoming.FRESH_INCOMING:
            return 0.1 + random * 0.3;
        case PreferIncoming.READY_INCOMING:
            return 0.4 + random * 0.6;
    }
};
