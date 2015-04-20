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
