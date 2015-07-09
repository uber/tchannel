// Copyright (c) 2015 Uber Technologies, Inc.

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
var EventEmitter = require('../../lib/event_emitter.js');

module.exports = FakeEgressNodes;

// e.g., topology = {'alice': ['127.0.0.1:4040'], 'bob': ['127.0.0.1:4041']}, '127.0.0.1:4040'
function FakeEgressNodes(options) {
    if (!(this instanceof FakeEgressNodes)) {
        return new FakeEgressNodes(options);
    }

    var self = this;

    EventEmitter.call(self);

    self.hostPort = options.hostPort;

    // Everyone must mutate this
    self.topology = options.topology;
    self.kValue = options.kValue;
    self.relayChannels = options.relayChannels;

    self.membershipChangedEvent = self.defineEvent('membershipChanged');
}

inherits(FakeEgressNodes, EventEmitter);

FakeEgressNodes.prototype.isExitFor = function isExitFor(serviceName) {
    var self = this;
    var hostPorts = self.topology[serviceName];

    // A random service; pick k random things
    if (!hostPorts) {
        hostPorts = self.getRandomNodes(serviceName);
    }

    return hostPorts.indexOf(self.hostPort) >= 0;
};

FakeEgressNodes.prototype.kValueFor = function kValueFor(serviceName) {
    var self = this;
    return self.kValue;
};

FakeEgressNodes.prototype.getRandomNodes =
function getRandomNodes(serviceName) {
    var self = this;

    var hosts = [];

    for (var i = 0; i < self.kValue; i++) {
        var n = Math.floor(Math.random() * self.relayChannels.length);

        var node = self.relayChannels[n].hostPort;
        if (hosts.indexOf(node) === -1) {
            hosts.push(node);
        }
    }

    self.topology[serviceName] = hosts;

    return hosts;
};

FakeEgressNodes.prototype.exitsFor = function exitsFor(serviceName) {
    var self = this;

    var hostPorts = self.topology[serviceName];

    // A random service; pick k random things
    if (!hostPorts) {
        hostPorts = self.getRandomNodes(serviceName);
    }

    var result = Object.create(null);
    hostPorts.forEach(function buildResult(hostPort, index) {
        result[hostPort] = serviceName + '~' + index;
    });
    return result;
};
