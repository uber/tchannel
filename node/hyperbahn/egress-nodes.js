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

module.exports = EgressNodes;

function EgressNodes(options) {
    if (!(this instanceof EgressNodes)) {
        return new EgressNodes(options);
    }
    var self = this;

    assert(options && options.ringpop, 'ringpop required');
    assert(options && options.defaultKValue, 'defaultKValue required');

    self.ringpop = options.ringpop;
    self.defaultKValue = options.defaultKValue;

    self.kValueForServiceName = {};
}

EgressNodes.prototype.kValueFor =
function kValueFor(serviceName) {
    var self = this;
    return self.kValueForServiceName[serviceName] ||
        self.defaultKValue;
};

EgressNodes.prototype.setKValueFor =
function setKValueFor(serviceName, k) {
    var self = this;
    self.kValueForServiceName[serviceName] = k;
};

EgressNodes.prototype.exitsFor =
function exitsFor(serviceName) {
    var self = this;
    var k = self.kValueFor(serviceName);
    // Object<hostPort: String, Array<lookupKey: String>>
    var exitNodes = Object.create(null);
    for (var i = 0; i < k; i++) {
        var shardKey = serviceName + '~' + String(i);

        // TODO ringpop will return itself if it cannot find
        // it which is probably the wrong semantics.
        var node = self.ringpop.lookup(shardKey);

        // TODO ringpop can return duplicates. do we want
        // <= k exitNodes or k exitNodes ?
        // TODO consider walking the ring instead.

        exitNodes[node] = exitNodes[node] || [];
        exitNodes[node].push(shardKey);
    }
    return exitNodes;
};
