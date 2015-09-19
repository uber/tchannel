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
var inherits = require('util').inherits;
var EventEmitter = require('./lib/event_emitter');

var TOMBSTONE_TTL_OFFSET = 500;

module.exports = Operations;

function Operations(opts) {
    var self = this;

    EventEmitter.call(self);
    self.draining = false;
    self.drainExempt = null;
    self.drainEvent = self.defineEvent('drain');

    self.timers = opts.timers;
    self.logger = opts.logger;
    self.random = opts.random;
    self.connectionStalePeriod = opts.connectionStalePeriod;

    self.connection = opts.connection;
    self.destroyed = false; // TODO need this?

    self.requests = {
        in: Object.create(null),
        out: Object.create(null)
    };
    self.pending = {
        in: 0,
        out: 0,
        busy: 0
    };
    self.lastTimeoutTime = 0;
}
inherits(Operations, EventEmitter);

Operations.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    if (self.connection) {
        info = self.connection.extendLogInfo(info);
    }

    return info;
};

function OperationTombstone(operations, id, time, req, context) {
    var self = this;

    self.type = 'tchannel.operation.tombstone';
    self.isTombstone = true;
    self.logger = operations.logger;
    self.operations = operations;
    self.id = id;
    self.time = time;
    self.timeout = TOMBSTONE_TTL_OFFSET + req.timeout;
    self.timeHeapHandle = null;
    self.destroyed = false;
    self.serviceName = req.serviceName;
    self.callerName = req.headers.cn;
    self.endpoint = req.endpoint;

    self.isBusyResponse = context && context.isErrorFrame &&
        context.codeName === 'Busy';
}

OperationTombstone.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    info.id = self.id;
    info.serviceName = self.serviceName;
    info.callerName = self.callerName;
    info.endpoint = self.endpoint;
    info.tombstoneTime = self.time;
    info.tombstoneTTL = self.timeout;
    info.heapCanceled = self.timeHeapHandle && !self.timeHeapHandle.item;
    info.heapExpireTime = self.timeHeapHandle && self.timeHeapHandle.expireTime;
    info.heapAmItem = self.timeHeapHandle && self.timeHeapHandle.item === self;

    if (self.operations) {
        info = self.operations.extendLogInfo(info);
        var other = self.operations.requests.out[self.id];
        if (self !== other) {
            info.otherType = typeof other;
            info.otherConstructorName = other && other.constructor && other.constructor.name;
        }
    }

    return info;
};

OperationTombstone.prototype.destroy = function destroy(now) {
    var self = this;

    self.destroyed = true;

    self.onTimeout(now);
};

OperationTombstone.prototype.onTimeout = function onTimeout(now) {
    var self = this;

    if (!self.destroyed && now < self.timeout + self.time) {
        self.logger.error('tombstone timed out too early', self.extendLogInfo({
            now: now,
            expireTime: self.timeout + self.time,
            delta: (self.timeout + self.time) - now
        }));
    }

    if (self.operations &&
        self.operations.requests.out[self.id] === self) {
        delete self.operations.requests.out[self.id];
        if (self.isBusyResponse) {
            self.operations.pending.busy--;
        }
        self.operations = null;
    } else {
        self.logger.warn('mismatched expired operation tombstone', self.extendLogInfo({}));
        self.operations = null;
    }

    self.timeHeapHandle = null;
};

Operations.prototype.checkLastTimeoutTime = function checkLastTimeoutTime(now) {
    var self = this;

    if (self.lastTimeoutTime &&
        now > self.lastTimeoutTime + self.connectionStalePeriod
    ) {
        self._deferResetDueToTimeouts(now);
    } else if (!self.lastTimeoutTime) {
        self.lastTimeoutTime = now;
    }
};

Operations.prototype._deferResetDueToTimeouts = function _deferResetDueToTimeouts(now) {
    var self = this;

    var elapsed = now - self.lastTimeoutTime;
    var err = errors.ConnectionStaleTimeoutError({
        period: self.connectionStalePeriod,
        elapsed: elapsed,
        lastTimeoutTime: self.lastTimeoutTime
    });
    process.nextTick(opCheckLastTimedout);

    function opCheckLastTimedout() {
        self.logger.warn('destroying socket from timeouts', self.connection.extendLogInfo({
            error: err
        }));
        self.connection.resetAll(err);
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

    var req = self.requests.out[id] || null;
    if (req && req.isTombstone) {
        return null;
    } else {
        return req;
    }
};

Operations.prototype.getInReq = function getInReq(id) {
    var self = this;

    return self.requests.in[id];
};

Operations.prototype.addOutReq = function addOutReq(req) {
    var self = this;

    req.operations = self;
    self.requests.out[req.id] = req;
    self.pending.out++;

    req.timeHeapHandle = self.connection.channel.timeHeap.update(req);

    return req;
};

Operations.prototype.addInReq = function addInReq(req) {
    var self = this;

    req.operations = self;
    self.requests.in[req.id] = req;
    self.pending.in++;

    req.timeHeapHandle = self.connection.channel.timeHeap.update(req);

    return req;
};

Operations.prototype.hasDrained = function hasDrained() {
    var self = this;

    if (self.pending.in === 0 &&
        self.pending.out === 0) {
        return true;
    } else if (self._isCollDrained(self.requests.in) &&
               self._isCollDrained(self.requests.out)) {
        return true;
    }

    return false;
};

Operations.prototype.checkDrained = function checkDrained() {
    var self = this;

    if (self.hasDrained()) {
        self.drainEvent.emit(self);
        self.drainEvent.removeAllListeners();
    }
};

Operations.prototype._isCollDrained = function _isCollDrained(coll) {
    var self = this;

    /* jshint forin:false */
    for (var id in coll) {
        var op = coll[id];
        if (!(op instanceof OperationTombstone) &&
            !op.drained &&
            !(self.drainExempt && self.drainExempt(op))
        ) {
            return false;
        }
    }

    return true;
};

Operations.prototype.popOutReq = function popOutReq(id, context) {
    var self = this;

    var req = self.requests.out[id];
    if (!req) {
        self.logMissingOutRequest(id, context);
        return null;
    } else if (req.isTombstone) {
        return null;
    }

    if (req.timeHeapHandle) {
        req.timeHeapHandle.cancel();
        req.timeHeapHandle = null;
    } else {
        self.logger.warn('Found OutRequest without timeHeapHandle', {
            serviceName: req.serviceName,
            endpoint: req.endpoint,
            socketRemoteAddr: req.remoteAddr,
            callerName: req.headers.cn
        });
    }

    var tombstone = new OperationTombstone(
        self, id, self.timers.now(), req, context
    );
    self.requests.out[id] = tombstone;
    tombstone.timeHeapHandle = self.connection.channel.timeHeap.update(tombstone, tombstone.time);

    if (tombstone.isBusyResponse) {
        self.pending.busy++;
    }

    req.operations = null;
    self.pending.out--;
    if (self.draining) {
        self.checkDrained();
    }

    return req;
};

Operations.prototype.logMissingOutRequest =
function logMissingOutRequest(id, context) {
    var self = this;

    // context is err or res
    if (context && context.originalId) {
        context = {
            error: context,
            id: context.originalId,
            info: 'got error frame for unknown id'
        };
    } else if (context && context.id) {
        context = {
            responseId: context.id,
            code: context.code,
            arg1: Buffer.isBuffer(context.arg1) ?
                String(context.arg1) : 'streamed-arg1',
            info: 'got call response for unknown id'
        };
    }

    // This could be because of a confused / corrupted server.
    self.logger.info('popOutReq received for unknown or lost id', {
        context: context,
        socketRemoteAddr: self.connection.socketRemoteAddr,
        direction: self.connection.direction
    });
};

Operations.prototype.popInReq = function popInReq(id) {
    var self = this;

    var req = self.requests.in[id];
    if (!req) {
        // TODO warn ?
        return null;
    }

    if (req.timeHeapHandle) {
        req.timeHeapHandle.cancel();
        req.timeHeapHandle = null;
    }

    delete self.requests.in[id];
    self.pending.in--;
    if (self.draining) {
        self.checkDrained();
    }

    return req;
};

Operations.prototype.clear = function clear() {
    var self = this;

    var now = self.timers.now();
    var inReqKeys = Object.keys(self.requests.in);
    var outReqKeys = Object.keys(self.requests.out);

    for (var i = 0; i < inReqKeys.length; i++) {
        self.popInReq(inReqKeys[i]);
    }
    for (var j = 0; j < outReqKeys.length; j++) {
        self.popOutReq(outReqKeys[j]);

        var tombstone = self.requests.out[outReqKeys[j]];
        if (tombstone.timeHeapHandle) {
            tombstone.timeHeapHandle.cancel();
        }
        tombstone.destroy(now);
    }
};

Operations.prototype.destroy = function destroy() {
    var self = this;

    self.destroyed = true;
};

Operations.prototype.sanitySweep = function sanitySweep() {
    var self = this;

    self._sweepOps(self.requests.in, 'in');
    self._sweepOps(self.requests.out, 'out');
};

Operations.prototype._sweepOps = function _sweepOps(ops, direction) {
    var self = this;

    var now = self.timers.now();
    var opKeys = Object.keys(ops);
    for (var i = 0; i < opKeys.length; i++) {
        var id = opKeys[i];
        var op = ops[id];
        if (op === undefined) {
            self.logger.warn('unexpected undefined operation', {
                direction: direction,
                id: id
            });
        } else if (op.timedOut) {
            self.logger.warn('lingering timed-out operation', {
                direction: direction,
                id: id
            });

            if (direction === 'in') {
                self.popInReq(id);
            } else if (direction === 'out') {
                self.popOutReq(id);
            }
        } else if (op.isTombstone) {
            var heap = self.connection.channel.timeHeap;
            var expireTime = op.time + op.timeout;

            if (!op.operations) {
                self.logger.warn('zombie tombstone', op.extendLogInfo({
                    direction: direction,
                    opKey: id
                }));
                delete ops[id];
                if (op.isBusyResponse) {
                    op.pending.busy--;
                }
                op.operations = null;
                op.timeHeapHandle.cancel();
                op.timeHeapHandle = null;
            } else if (expireTime < now && heap.lastRun > expireTime) {
                self.logger.warn('stale tombstone', op.extendLogInfo({
                    direction: direction,
                    opKey: id,
                    now: now,
                    staleDelta: op.time + op.timeout - now,
                    expireTime: expireTime,
                    heapLastRun: heap.lastRun
                }));
                delete ops[id];
                if (op.isBusyResponse) {
                    op.pending.busy--;
                }
                op.operations = null;
                op.timeHeapHandle.cancel();
                op.timeHeapHandle = null;
            }
        }
    }
};
