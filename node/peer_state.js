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

function TChannelPeerState(channel, peer) {
    var self = this;
    self.channel = channel;
    self.peer = peer;
}

TChannelPeerState.prototype.close = function close(callback) {
    callback();
};

TChannelPeerState.prototype.shouldRequest = function shouldRequest(/* op, options */) {
    // TODO: op isn't quite right currently as a "TChannelClientOp", the
    // intention is that the other (non-options) arg encapsulates all requests
    // across retries and setries
    return 0;
};

// connection life cycle
TChannelPeerState.prototype.onConnSocket = function onConnSocket(/* peer, conn */) {
};

TChannelPeerState.prototype.onConnSocketClose = function onConnSocketClose(/* peer, conn */) {
};

TChannelPeerState.prototype.onConnSocketError = function onConnSocketError(/* peer, conn, err */) {
};

// out op life cycle
TChannelPeerState.prototype.onOutOp = function onOutOp(/* peer, op */) {
};

TChannelPeerState.prototype.onOutOpDone = function onOutOpDone(/* peer, op */) {
};

TChannelPeerState.prototype.onOutOpError = function onOutOpError(/* peer, op, err */) {
};

// in op life cycle
TChannelPeerState.prototype.onInOp = function onInOp(/* peer, op */) {
};

TChannelPeerState.prototype.onInOpDone = function onInOpDone(/* peer, op */) {
};

TChannelPeerState.prototype.onInOpError = function onInOpError(/* peer, op, err */) {
};

// TODO: add hookups in peer / channel connection
// peer.state.onConnSocket(peer, conn);
// peer.state.onConnSocketClose(peer, conn);
// peer.state.onConnSocketError(peer, conn, err);
//
// peer.state.onOutOp(peer, op);
// peer.state.onOutOpDone(peer, op);
// peer.state.onOutOpError(peer, op, err);
//
// peer.state.onInOp(peer, op);
// peer.state.onInOpDone(peer, op);
// peer.state.onInOpError(peer, op, err);

module.exports = TChannelPeerState;
