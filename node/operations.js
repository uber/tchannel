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

var errors = require('./errors.js');

var TOMBSTONE_TTL_OFFSET = 500;

module.exports = Operations;

function Operations(opts) {
    var self = this;

    self.timers = opts.timers;
    self.logger = opts.logger;
    self.random = opts.random;
    self.timeoutCheckInterval = opts.timeoutCheckInterval;
    self.timeoutFuzz = opts.timeoutFuzz;
    self.initTimeout = opts.initTimeout;
    self.connectionStalePeriod = opts.connectionStalePeriod;

    self.connection = opts.connection;
    self.startTime = self.timers.now();
    self.timer = null;
    self.destroyed = false;

    self.tombstones = {
        out: []
    };
    self.requests = {
        in: {},
        out: {}
    };
    self.pending = {
        in: 0,
        out: 0
    };
    self.lastTimeoutTime = 0;
}

function OperationTombstone(id, time, timeout) {
    var self = this;

    self.id = id;
    self.time = time;
    self.timeout = timeout;
}

Operations.prototype.startTimeoutTimer =
function startTimeoutTimer() {
    var self = this;

    self.timer = self.timers.setTimeout(
        onChannelTimeout, self._getTimeoutDelay()
    );

    function onChannelTimeout() {
        self._onTimeoutCheck();
    }
};

Operations.prototype.getRequests = function getRequests() {
    var self = this;

    return self.requests;
};

Operations.prototype.getPending = function getPending() {
    var self = this;

    return self.pending;
};

Operations.prototype.getOutReq = function getOutReq(id) {
    var self = this;

    return self.requests.out[id];
};

Operations.prototype.getInReq = function getInReq(id) {
    var self = this;

    return self.requests.in[id];
};

Operations.prototype.addOutReq = function addOutReq(req) {
    var self = this;

    self.requests.out[req.id] = req;
    self.pending.out++;

    return req;
};

Operations.prototype.addInReq = function addInReq(req) {
    var self = this;

    self.requests.in[req.id] = req;
    self.pending.in++;

    return req;
};

Operations.prototype.popOutReq = function popOutReq(id, context) {
    var self = this;

    var req = self.requests.out[id];
    if (!req) {
        var tombstones = self.tombstones.out;
        var isStale = false;

        for (var i = 0; i < tombstones.length; i++) {
            if (tombstones[i].id === id) {
                isStale = true;
                break;
            }
        }

        // If this id has been timed out then just return
        if (isStale) {
            return null;
        }

        // This could be because of a confused / corrupted server.
        self.logger.info('popOutReq received for unknown or lost id', {
            context: context,
            socketRemoteAddr: self.connection.socketRemoteAddr,
            direction: self.connection.direction
        });
        return null;
    }

    delete self.requests.out[id];

    var now = self.timers.now();
    var timeout = now + TOMBSTONE_TTL_OFFSET + req.ttl +
        self._getTimeoutFuzz();

    self.tombstones.out.push(new OperationTombstone(
        req.id, self.timers.now(), timeout
    ));
    self.pending.out--;

    return req;
};

Operations.prototype.popInReq = function popInReq(id) {
    var self = this;

    var req = self.requests.in[id];
    if (!req) {
        // TODO warn ?
        return null;
    }

    delete self.requests.in[id];
    self.pending.in--;

    return req;
};

Operations.prototype.removeReq = function removeReq(id) {
    var self = this;

    if (id in self.requests.in) {
        delete self.requests.in[id];
    } else if (id in self.requests.out) {
        delete self.requests.out[id];
    }
};

Operations.prototype.clear = function clear() {
    var self = this;

    self.pending.in = 0;
    self.pending.out = 0;
    self.tombstones.out = [];
};

Operations.prototype.destroy = function destroy() {
    var self = this;

    self.destroyed = true;

    if (self.timer) {
        self.timers.clearTimeout(self.timer);
        self.timer = null;
    }
};

// timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
//   base - fuzz/2 to base + fuzz/2
Operations.prototype._getTimeoutDelay =
function _getTimeoutDelay() {
    var self = this;

    return self.timeoutCheckInterval + self._getTimeoutFuzz();
};

Operations.prototype._getTimeoutFuzz =
function _getTimeoutFuzz() {
    var self = this;

    var fuzz = self.timeoutFuzz;
    if (!fuzz) {
        return 0;
    }

    return Math.round(Math.floor(self.random() * fuzz)) - (fuzz / 2);
};

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
Operations.prototype._onTimeoutCheck =
function _onTimeoutCheck() {
    var self = this;
    if (self.destroyed) {
        return;
    }

    var isInitialized = self.connection.remoteName;
    if (!isInitialized) {
        var elapsed = self.timers.now() - self.startTime;
        if (elapsed >= self.initTimeout) {
            self.connection.timedOutEvent
                .emit(self, errors.ConnectionTimeoutError({
                    start: self.startTime,
                    elapsed: elapsed,
                    timeout: self.initTimeout
                }));
            return;
        }
    }

    self._checkTimeout(self.requests.out, 'out');
    self._checkTimeout(self.requests.in, 'in');

    var now = self.timers.now();
    for (var i = 0; i < self.tombstones.out.length; i++) {
        var tombstone = self.tombstones.out[i];
        if (now >= tombstone.timeout) {
            self.tombstones.out.splice(i, 1);
            i--;
        }
    }

    self.startTimeoutTimer();
};

Operations.prototype._checkTimeout =
function _checkTimeout(ops, direction) {
    var self = this;
    var opKeys = Object.keys(ops);
    for (var i = 0; i < opKeys.length; i++) {
        var id = opKeys[i];
        var req = ops[id];
        if (req === undefined) {
            self.logger.warn('unexpected undefined request', {
                direction: direction,
                id: id
            });
        } else if (req.timedOut) {
            self.logger.warn('lingering timed-out request', {
                direction: direction,
                id: id
            });

            if (direction === 'in') {
                self.popInReq(id);
            } else if (direction === 'out') {
                self.popOutReq(id);
            }
        } else if (req.checkTimeout()) {
            if (direction === 'out') {
                var now = self.timers.now();
                if (self.lastTimeoutTime &&
                    now > self.lastTimeoutTime + self.connectionStalePeriod
                ) {
                    var err = errors.ConnectionStaleTimeoutError({
                        lastTimeoutTime: self.lastTimeoutTime
                    });
                    self.connection.timedOutEvent
                        .emit(self, err);
                } else if (!self.lastTimeoutTime) {
                    self.lastTimeoutTime = self.timers.now();
                }
                
            }
            // else
            //     req.res.sendError // XXX may need to build
            if (direction === 'in') {
                self.popInReq(id);
            } else if (direction === 'out') {
                self.popOutReq(id);
            }
        }
    }
};
