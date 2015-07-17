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

function DoublyLinkedList() {
    if (!(this instanceof DoublyLinkedList)) {
        return new DoublyLinkedList();
    }

    var self = this;

    self._previous = self;
    self._next = self;
    self.size = 0;
}

DoublyLinkedList.prototype.isEmpty = function isEmpty() {
    var self = this;
    if (self._previous === self && self._next === self) {
        assert(self.size === 0);
    }
    return self._previous === self && self._next === self;
};

DoublyLinkedList.prototype.insert = function insert(node) {
    var self = this;
    node._next = self;
    node._previous = self._previous;
    self._previous._next = node;
    self._previous = node;
    self.size++;
};

DoublyLinkedList.prototype.find = function find(node) {
    var self = this;
    var cur = self._next;
    while (cur !== self) {
        if (cur === node) return true;
        cur = cur._next;
    }

    return false;
};

DoublyLinkedList.prototype.count = function count() {
    var self = this;
    var c = 0;
    var cur = self._next;
    while (cur !== self) {
        c++;
        cur = cur._next;
    }

    assert(c === self.size);
    return c;
};

DoublyLinkedList.prototype.remove = function remove(node) {
    var self = this;
    node._previous._next = node._next;
    node._next._previous = node._previous;
    self.size--;
};

DoublyLinkedList.prototype.pop = function pop() {
    var self = this;
    if (self.isEmpty()) {
        return null;
    }

    var node = self._next;
    self.remove(node);
    return node;
};

function ObjectPool(options) {
    if (!(this instanceof ObjectPool)) {
        return new ObjectPool(options);
    }

    var self = this;
    self.name = options.name;
    self.create = options.create;
    self.staticPoolSize = options.staticPoolSize;
    self.maxPoolSize = options.maxPoolSize;
    if (self.maxPoolSize === undefined) {
        self.maxPoolSize = 0xFFFFFFFF;
    }

    self.freeList = new DoublyLinkedList();
    self.usedList = new DoublyLinkedList();

    if (self.staticPoolSize) {
        for (var i = 0; i < self.staticPoolSize; i++) {
            var obj = self.create();
            self.freeList.insert(obj);
        }
    }
}

ObjectPool.prototype.allocate = function allocate() {
    var self = this;
    var obj;

    if (self.usedList.size >= self.maxPoolSize) {
        obj = self.create.apply(null, arguments);
        return obj;
    }

    // console.log('++++++', self.name, self.freeList.size, self.usedList.size);

    if (self.freeList.isEmpty()) {
        obj = self.create.apply(null, arguments);
    } else {
        obj = self.freeList.pop();
        obj.setup.apply(obj, arguments);
    }

    self.usedList.insert(obj);

    // console.log('------', self.name, self.freeList.size, self.usedList.size);

    obj._inUse = true;
    return obj;
};

ObjectPool.prototype.release = function release(obj) {
    var self = this;

    if (!obj._inUse) {
        return;
    }

    // console.log('++++++', self.name, self.freeList.size, self.usedList.size);

    assert(self.usedList.size > 0);
    self.usedList.remove(obj);
    self.freeList.insert(obj);

    // console.log('------', self.name, self.freeList.size, self.usedList.size);

    obj.clear();
    obj._inUse = false;
};

module.exports = ObjectPool;
