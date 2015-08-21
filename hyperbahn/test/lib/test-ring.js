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

function RNG(seed) {
    var mod = Math.pow(2, 32);
    var mul = 214013;
    var add = 253101;
    var last = seed;
    return function next() {
        last = (mul * last + add) % mod;
        return last;
    };
}

var HASH_TO_HOST_COUNT = 1000;

module.exports = TestRing;

function TestRing(application) {
    if (!(this instanceof TestRing)) {
        return new TestRing(application);
    }

    var self = this;

    self.application = application;
    self.rand = RNG(123);
}

TestRing.prototype.hashToHostPort = function hashToHostPort(
    destinationApp, minNumBuckets, kValue
) {
    var self = this;
    if (!minNumBuckets) {
        minNumBuckets = 1;
    }
    if (!kValue) {
        minNumBuckets = 5;
    }

    var sourceRingpop = self.application.clients.ringpop;

    var hostPort = destinationApp.hostPort;

    for (var i = 0; i < HASH_TO_HOST_COUNT; i++) {
        var service = self.rand().toString(16) +
                      self.rand().toString(16) +
                      self.rand().toString(16) +
                      self.rand().toString(16);
        var shardKey = service + '~1';
        var node = sourceRingpop.lookup(shardKey);
        if (node === hostPort) {
            var seen = {};
            seen[node] = true;
            var got = 1;
            var j = 2;
            while (got < minNumBuckets && j <= kValue) {
                node = sourceRingpop.lookup(service + '~' + j);
                if (!seen[node]) {
                    seen[node] = true;
                    ++got;
                }
                j++;
            }
            return {
                service: service,
                nodes: Object.keys(seen)
            };
        }
    }

    throw new Error('could not hash to ' + hostPort);
};

TestRing.prototype.forceNonOwnership = function forceNonOwnership(
    shardKey
) {
    var self = this;

    var ringpop = self.application.clients.ringpop;

    var oldLookup = ringpop.lookup;
    ringpop.lookup = fakeLookup;

    function fakeLookup(key) {
        if (key === shardKey) {
            return '127.0.0.1:3000';
        }

        return oldLookup.call(ringpop, key);
    }
};
