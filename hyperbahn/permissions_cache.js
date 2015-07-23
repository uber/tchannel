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

var LRUCache = require('lru-cache');

var BUCKET_RESET_DURATION = 1000;
// This is a dummy value until we nail down how, exactly, we'll be getting
// the actual rate limit from vorenus-controller.
var NUM_TOKENS = 100;

function PermissionsCache(options) {
    if (!(this instanceof PermissionsCache)) {
        return new PermissionsCache(options);
    }
    var self = this;

    self.lru = LRUCache(options);

    self.channel = options.channel;
    self.logger = options.logger;
    self._intervalId = setInterval(bucketReset, BUCKET_RESET_DURATION);

    self.channel.statEvent.addListener(increment);

    function bucketReset() {
        var keys = self.lru.keys();
        for (var i = 0; i < keys.length; i++) {
            self.resetBucketTokens(keys[i]);
        }
    }

    function increment(stat) {
        self.increment(stat);
    }
}

PermissionsCache.prototype.clearBuckets = function clearBuckets() {
    var self = this;
    clearInterval(self._intervalId);
    self.lru.reset();
};

PermissionsCache.prototype.increment = function increment(stat) {
    var self = this;
    if (stat.name === 'tchannel.inbound.calls.recvd' &&
        stat.type === 'counter'
    ) {
        var key = createCallsKey(
            stat.tags.callingService, stat.tags.service
        );
        var tokens = self.lru.get(key);
        if (typeof tokens === 'undefined') {
            self.resetBucketTokens(key);
            tokens = self.lru.get(key);
        }

        self.lru.set(key, tokens - 1);
    }
};

PermissionsCache.prototype.resetBucketTokens = function resetBucketTokens(key) {
    // A pretty anemic method right now to be sure, but I suspect there might
    // be more to this logic in the future.
    var self = this;
    self.lru.set(key, NUM_TOKENS);
};

function createCallsKey(caller, callee) {
    return caller + '_' + callee;
}

module.exports = PermissionsCache;
