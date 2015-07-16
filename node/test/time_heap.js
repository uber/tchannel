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

var test = require('tape');
var util = require('util');
var TimeMock = require('time-mock');
var TestSearch = require('./lib/test_search');

var TimeHeap = require('../time_heap');

test('TimeHeap works for all 7-permutations', function t(assert) {

    function testWithTimes(state, assert) {
        var times = state.perm;
        var items = createTestTimeoutItems(times);

        var timers = TimeMock(1);
        var heap = new TimeHeap({
            timers: timers
        });

        var now = timers.now();
        var i = 0;
        for (i = 0; i < items.length; i++) {
            heap.update(items[i], now);
        }

        items.sort(function cmp(a, b) {
            return a.timeout - b.timeout;
        });

        var last = 0;
        for (i = 0; i < items.length; i++) {
            var item = items[i];
            var desc = util.format('items[%s]: %s', i, item.name);
            var elapse = item.timeout - last;
            assert.ok(!item.timedOut, desc + ' not yet timed out @t' + now);
            now += elapse;
            timers.advance(elapse);
            heap.callExpiredTimeouts(now); // in lieu of defering through process.nextTick
            assert.ok(item.timedOut, desc + ' timed out out @t' + now);
            last = item.timeout;
        }

        assert.end();
    }

    var perms = [];
    permute([1, 2, 3, 4, 5, 6, 7], function each(perm) {
        perms.push(perm);
    });

    (new TestSearch({
        silentPass: true,
        first: true,

        init: function init() {
            this.frontier.push({
                permId: 0,
                perm: perms[0]
            });
        },

        next: function next(state, _emit) {
            var nextPermId = state.permId + 1;
            if (nextPermId < perms.length) {
                _emit({
                    permId: nextPermId,
                    perm: perms[nextPermId]
                });
            }
        },

        test: testWithTimes
    })).run(assert);
});

function TestTimeoutItem(t, name) {
    var self = this;
    self.timeout = t;
    self.name = name;
    self.timedOut = 0;
}

TestTimeoutItem.prototype.onTimeout = function onTimeout(now) {
    var self = this;
    self.timedOut = now;
};

function createTestTimeoutItems(times) {
    return times.map(function each(t) {
        var name = String.fromCharCode('a'.charCodeAt(0) + t);
        return new TestTimeoutItem(t, name);
    });
}

function permute(letters, iter) {
    if (letters.length <= 0) {
        iter(letters);
        return;
    }

    letters.forEach(function eachHead(head, i) {
        if (i > 0) {
            letters[i] = letters[0];
            letters[0] = head;
        }

        var tail = letters.slice(1);
        permute(tail, function eachSubPerm(subPerm) {
            subPerm.unshift(head);
            iter(subPerm);
            // subPerm.shift();
        });

        if (i > 0) {
            letters[0] = letters[i];
            letters[i] = head;
        }
    });
}
