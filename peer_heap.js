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

module.exports = PeerHeap;

// A max-score (pre-computed) for peer selection

function PeerHeap() {
    var self = this;

    self.array = [];
    // TODO: worth it to keep a tail free list like TimeHeap?
    // self.end = 0;
    self._stack = [];
}

PeerHeap.prototype.choose = function choose(threshold, filter) {
    var self = this;

    if (!self.array.length) {
        return null;
    }

    var el;
    if (filter) {
        el = self._chooseFilteredEl(threshold, filter);
    } else {
        el = self._chooseEl(threshold);
    }

    if (!el) {
        return null;
    }

    return el.peer;

};

PeerHeap.prototype._chooseEl = function _chooseEl(threshold) {
    var self = this;

    var el = self.array[0];
    if (el.score <= threshold) { // TODO: why inclusive?
        return null;
    }

    return el;
};

PeerHeap.prototype._chooseFilteredEl = function _chooseFilteredEl(threshold, filter) {
    var self = this;

    // TODO: is it worth it to unroll the first iteration of the loop below so
    // that we incur minimal overhead for "the top of heap is okay" case?

    // NOTE: assumes self._stack starts off empty
    self._stack.push(0);
    while (self._stack.length) {
        var i = self._stack.shift();

        var el = self.array[i];
        if (el.score <= threshold) { // TODO: why inclusive?
            break;
        }

        if (!filter || filter(el.peer)) {
            return el;
        }

        var left = 2 * i + 1;
        if (left < self.array.length) {
            var right = left + 1;
            if (right < self.array.length) {
                if (self.array[right].score > self.array[left].score) {
                    self._stack.push(right, left);
                } else {
                    self._stack.push(left, left);
                }
            } else {
                self._stack.push(left);
            }
        }
    }
    self._stack.length = 0;

    return null;
};

PeerHeap.prototype.clear = function clear() {
    var self = this;

    for (var i = 0; i < self.array.length; i++) {
        var el = self.array[i];
        el.heap = null;
        el.peer = null;
        el.score = 0;
        el.index = 0;
    }
    self.array.length = 0;
};

PeerHeap.prototype.add = function add(peer) {
    var self = this;

    var score = peer.handler.shouldRequest();
    var i = self.push(peer, score);
    var el = self.array[i];
    return el;
};

PeerHeap.prototype.rescore = function rescore() {
    var self = this;

    for (var i = 0; i < self.array.length; i++) {
        var el = self.array[i];
        el.score = el.peer.handler.shouldRequest();
    }
    self.heapify();
};

PeerHeap.prototype.heapify = function heapify() {
    var self = this;

    if (self.array.length <= 1) {
        return;
    }

    for (var i = Math.floor(self.array.length / 2 - 1); i >= 0; i--) {
        self.siftdown(i);
    }
};

PeerHeap.prototype.remove = function remove(i) {
    var self = this;

    if (i >= self.array.length) {
        return;
    }

    if (self.array.length === 1) {
        self.array.pop();
        return;
    }

    var j = self.array.length - 1;
    if (i === j) {
        self.array.pop();
        return;
    }

    self.swap(i, j);
    self.array.pop();
    self.siftup(i);
};

PeerHeap.prototype.push = function push(peer, score) {
    var self = this;

    var el = new PeerHeapElement(self);
    el.peer = peer;
    el.score = score;
    el.index = self.array.length;

    self.array.push(el);
    return self.siftup(el.index);
};

PeerHeap.prototype.pop = function pop() {
    var self = this;
    var peer = null;

    if (!self.array.length) {
        return peer;
    }

    if (self.array.length === 1) {
        peer = self.array.pop();
        return peer;
    }

    peer = self.array[0].peer;
    self.array[0] = self.array.pop();
    self.siftdown(0);

    return peer;
};

PeerHeap.prototype.siftdown = function siftdown(i) {
    var self = this;

    while (true) {
        var left = (2 * i) + 1;
        if (left >= self.array.length) {
            return i;
        }

        var right = left + 1;
        var child = left;
        if (right < self.array.length &&
            self.array[right].score > self.array[left].score) {
            child = right;
        }

        if (self.array[child].score > self.array[i].score) {
            self.swap(i, child);
            i = child;
        } else {
            return i;
        }
    }
};

PeerHeap.prototype.siftup = function siftup(i) {
    var self = this;

    while (i > 0) {
        var par = Math.floor((i - 1) / 2);
        if (self.array[i].score > self.array[par].score) {
            self.swap(i, par);
            i = par;
        } else {
            return i;
        }
    }

    return 0;
};

PeerHeap.prototype.swap = function swap(i, j) {
    var self = this;

    var a = self.array[i];
    var b = self.array[j];

    self.array[i] = b;
    self.array[j] = a;
    b.index = i;
    a.index = j;
};

function PeerHeapElement(heap) {
    var self = this;

    self.heap = heap;
    self.peer = null;
    self.score = 0;
    self.index = 0;
}

PeerHeapElement.prototype.rescore = function rescore(score) {
    var self = this;

    if (!self.heap) {
        return;
    }

    if (score === undefined) {
        score = self.peer.handler.shouldRequest();
    }

    self.score = score;
    self.index = self.heap.siftup(self.index);
    self.index = self.heap.siftdown(self.index);
};
