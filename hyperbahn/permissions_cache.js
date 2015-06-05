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
var LRUCache = require('lru-cache');

function PermissionsCache(options) {
    if (!(this instanceof PermissionsCache)) {
        return new PermissionsCache(options);
    }
    var self = this;

    self.options = options;
    PermissionsCache.super_.call(self, self.options);

    self.channel = self.options.channel;
    self.logger = self.options.logger;
    self.value = 0;

    self.channel.statEvent.addListener(self.increment.bind(self));
}

inherits(PermissionsCache, LRUCache);

PermissionsCache.prototype.increment = function increment(stat) {
    var self = this;
    if (stat.name === 'inbound.calls.recvd' && stat.type === 'counter') {
        var key = createCallsKey(stat.tags['calling-service'], stat.tags.service);
        self.set(key, (self.get(key) || 0) + 1);
    }
};

function createCallsKey(caller, callee) {
    return caller + '_' + callee;
}

module.exports = PermissionsCache;
