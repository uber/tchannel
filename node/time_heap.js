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

module.exports = TimeHeap;

var globalTimers = {
    setTimeout: require('timers').setTimeout,
    clearTimeout: require('timers').clearTimeout,
    now: Date.now
};

/* A specialized min-time heap
 *
 * new TimeHeap({
 *   timer: {now, setTimeout, clearTimeout},
 *   minTimeout: Number | (now) -> Number
 * })
 *
 * The items on the heap must have two properties:
 * - item.timeout is ms timeout, relative to heap add time
 * - item.onTimeout is a callback which gets called once the item has expired;
 *   the callback is passed the current time in ms.
 *
 * Overview:
 * - timeHeap.array is an array of TimeHeapElement objects
 *
 * - timeHeap.lastTime is the timestamp (ms) that all times in the heap are
 *   relative to
 *
 * - timeHeap.timer is the currently pending timer object or null
 *
 * - timeHeap.expired are any items pending having their .onTimeout called; this
 *   call is defered until next tick after a drain to avoid any heap
 *   interactions/changes while draining (if the callback adds something else
 *   to the heap)
 *
 * The primary public API is:
 *     timeHeap.update(item, ?now)
 *
 * Note the method is is intentionally not named something simple like "add" or
 * "append" since it does a bit more:
 * - pop any expired times, and defer a call to their .onTimeout
 * - push the new item and its expiration time onto the heap
 * - set a timer if there is none or the newly added item is the next to expire
 *
 * TODO: shrink array if end is << array.length/2 (trigger in pop and/or a
 * sweep on an interval)
 */

function TimeHeap(options) {
    var self = this;
    options = options || {};

    self.timers = options.timers || globalTimers;
    self.minTimeout = options.minTimeout || null;
    self.array = [];
    self.expired = [];
    self.lastTime = self.timers.now();
    self.timer = null;
    self.end = 0;
}

TimeHeap.prototype.clear = function clear() {
    var self = this;

    self.timers.clearTimeout(self.timer);
    self.array = [];
    self.expired = [];
    self.timer = null;
    self.lastTime = self.timers.now();
    self.end = 0;
};

TimeHeap.prototype.getNextTimeout = function getNextTimeout(now) {
    var self = this;

    var timeout = self.array[0].expireTime - now;
    if (typeof self.minTimeout === 'function') {
        timeout = Math.max(self.minTimeout(now), timeout);
    } else if (typeof self.minTimeout === 'number') {
        timeout = Math.max(self.minTimeout, timeout);
    }
    return timeout;
};

TimeHeap.prototype.update = function update(item, now) {
    var self = this;

    if (now === undefined) {
        now = self.timers.now();
    }

    self.drainExpired(now);
    var time = now + item.timeout;
    var i = self.push(item, time);
    // update timer if none, or the newly added item is the new root
    if (!self.timer || i === 0) {
        self.setNextTimer(now);
    }
    return self.array[i];
};

TimeHeap.prototype.setNextTimer = function setNextTimer(now) {
    var self = this;

    if (self.timer) {
        self.timers.clearTimeout(self.timer);
    }

    var timeout = self.getNextTimeout(now);
    self.timer = self.timers.setTimeout(onTimeout, timeout);

    function onTimeout() {
        var now = self.timers.now();
        self.onTimeout(now);
    }
};

TimeHeap.prototype.onTimeout = function onTimeout(now) {
    var self = this;

    self.timer = null;
    self.drainExpired(now);
    if (self.end) {
        self.setNextTimer(now);
    }
};

TimeHeap.prototype.drainExpired = function drainExpired(now) {
    var self = this;

    while (self.end && self.array[0].expireTime <= now) {
        var item = self.pop();
        if (item) {
            self.expired.push(item);
        }
    }
    if (self.expired.length) {
        self.callExpiredTimeouts(now);
    }
};

TimeHeap.prototype.callExpiredTimeouts = function callExpiredTimeouts(now) {
    var self = this;

    while (self.expired.length) {
        var item = self.expired.shift();
        item.onTimeout(now);
    }
};

TimeHeap.prototype.push = function push(item, expireTime) {
    var self = this;

    var i = self.end;
    if (i >= self.array.length) {
        i = self.array.length;
        self.array.push(new TimeHeapElement());
    }
    var el = self.array[i];
    el.expireTime = expireTime;
    el.item = item;
    self.end = i + 1;
    return self.siftup(i);
};

TimeHeap.prototype.pop = function pop() {
    var self = this;

    if (!self.end) {
        return null;
    }

    var el = self.array[0];
    self.end--;
    self.swap(0, self.end);
    self.siftdown(0);

    var item = el.item;
    el.expireTime = 0;
    el.item = null;
    return item;
};

TimeHeap.prototype.siftdown = function siftdown(i) {
    var self = this;

    while (true) {
        var left = (2 * i) + 1;
        var right = left + 1;
        if (left < self.end &&
            self.array[left].expireTime < self.array[i].expireTime) {
            if (right < self.end &&
                self.array[right].expireTime < self.array[left].expireTime) {
                self.swap(i, right);
                i = right;
            } else {
                self.swap(i, left);
                i = left;
            }
        } else if (right < self.end &&
                   self.array[right].expireTime < self.array[i].expireTime) {
            self.swap(i, right);
            i = right;
        } else {
            return i;
        }
    }
};

TimeHeap.prototype.siftup = function siftup(i) {
    var self = this;

    while (i > 0) {
        var par = Math.floor((i - 1) / 2);
        if (self.array[i].expireTime < self.array[par].expireTime) {
            self.swap(i, par);
            i = par;
        } else {
            break;
        }
    }
    return i;
};

TimeHeap.prototype.swap = function swap(i, j) {
    var self = this;

    var tmp = self.array[i];
    self.array[i] = self.array[j];
    self.array[j] = tmp;
};

function TimeHeapElement() {
    this.expireTime = 0;
    this.item = null;
}

TimeHeapElement.prototype.cancel = function cancel() {
    this.item = null;
};
