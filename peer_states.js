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

var errors = require('./errors');
var TChannelPeerState = require('./peer_state');

module.exports.TChannelPeerHealthyState = TChannelPeerHealthyState;
module.exports.TChannelPeerUnhealthyState = TChannelPeerUnhealthyState;

/*
 * Collectively, the health states receive additional options through the peer
 * options:
 * - maxErrorRate (error rate to go from healthy to unhealthy)
 * - minResponseCount (response count to go from unhealthy to healthy)
 * - TODO
 *
 * They also inherit:
 * - channel.timers
 * - channel.random
 */

var symptoms = {
    'BadRequest': false, // not an indicator of bad health
    'Cancelled': false, // not an indicator of bad health
    'Timeout': true, // TODO throttle
    'Busy': true, // TODO throttle
    'Declined': true,
    'UnexpectedError': true,
    'NetworkError': true,
    'FatalProtocolError': true
};

function healthyScore(state/* , req, options */) {
    // space:
    //   [0.1, 0.2)  unconnected peers
    //   [0.2, 0.3)  incoming connections
    //   [0.3, 0.4)  new outgoing connections
    //   [0.4, 1.0)  identified outgoing connections
    var inconn = state.peer.getInConnection();
    var outconn = state.peer.getOutConnection();
    var random = state.peer.outPendingWeightedRandom();
    if (!inconn && !outconn) {
        return 0.1 + random * 0.1;
    } else if (!outconn || outconn.direction !== 'out') {
        return 0.2 + random * 0.1;
    } else if (outconn.remoteName === null) {
        return 0.3 + random * 0.1;
    } else {
        return 0.4 + random * 0.6;
    }
}

// ## Healthy

function TChannelPeerHealthyState(channel, peer) {
    var self = this;
    TChannelPeerState.call(self, channel, peer);
    self.timers = channel.timers;
    self.random = channel.random;
    self.period = peer.options.period || 1000; // ms
    self.start = self.timers.now();
    self.maxErrorRate = peer.options.maxErrorRate || 0.5;
    self.okCount = 0;
    self.notOkCount = 0;
}

inherits(TChannelPeerHealthyState, TChannelPeerState);

TChannelPeerHealthyState.prototype.type = 'tchannel.healthy';

TChannelPeerHealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return '[HealthyPeer ' + self.okCount + 'ok ' + self.notOkCount + 'err]';
};

TChannelPeerHealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;
    var now = self.timers.now();
    // At the conclusion of a period
    if (now - self.start >= self.period) {
        var totalCount = self.okCount + self.notOkCount;
        // Transition to unhealthy state if the success rate dips below the
        // acceptable threshold.
        if (self.notOkCount / totalCount > self.maxErrorRate) {
            self.peer.setState(TChannelPeerUnhealthyState);
            return 0;
        }
        // Alternatley, start a new monitoring period.
        self.start = self.timers.now();
        self.okCount = 0;
        self.notOkCount = 0;
    }
    // TODO throttle
    return healthyScore(self, req, options);
};

TChannelPeerHealthyState.prototype.onRequest = function onRequest(/* req */) {
};

TChannelPeerHealthyState.prototype.onRequestResponse = function onRequestResponse(/* req */) {
    var self = this;
    self.okCount++;
};

TChannelPeerHealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;
    var codeString = errors.classify(err);
    if (symptoms[codeString]) {
        self.notOkCount++;
    }
};

// ## Unhealthy

function TChannelPeerUnhealthyState(channel, peer) {
    var self = this;
    TChannelPeerState.call(self, channel, peer);
    self.timers = channel.timers;
    self.random = channel.random;
    self.minResponseCount = peer.options.probation || 5;
    self.period = peer.options.period || 1000;
    self.start = self.timers.now();
    self.successCount = 0;
    self.triedThisPeriod = true;
}

inherits(TChannelPeerUnhealthyState, TChannelPeerState);

TChannelPeerUnhealthyState.prototype.type = 'tchannel.unhealthy';

TChannelPeerUnhealthyState.prototype.toString = function healthyToString() {
    var self = this;
    return '[UnhealthyPeer ' + self.successCount + 'ok]';
};

TChannelPeerUnhealthyState.prototype.shouldRequest = function shouldRequest(req, options) {
    var self = this;

    // Start a new period if the previous has concluded
    var now = self.timers.now();
    if (now - self.start >= self.period) {
        self.start = self.timers.now();
        self.triedThisPeriod = false;
    }

    // Allow one trial per period
    if (self.triedThisPeriod) {
        return 0;
    }

    var score = healthyScore(self, req, options);
    if (score >= 0.1 && score < 0.3) { // TODO predicate
        // TODO: add channel / peers level support for "want more connections?"
        self.peer.connect();
    }
    return score;
};

TChannelPeerUnhealthyState.prototype.onRequest = function onRequest(/* req */) {
    var self = this;
    self.triedThisPeriod = true;
};

TChannelPeerUnhealthyState.prototype.onRequestResponse = function onRequestResponse(/* req */) {
    var self = this;
    self.successCount++;
    if (self.successCount > self.minResponseCount) {
        self.peer.setState(TChannelPeerHealthyState);
    }
};

TChannelPeerUnhealthyState.prototype.onRequestError = function onRequestError(err) {
    var self = this;
    var codeString = errors.classify(err);
    if (symptoms[codeString]) {
        self.successCount = 0;
    }
};
