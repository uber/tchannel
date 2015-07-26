'use strict';

var TChannel = require('../../../channel.js');
var TChannelJSON = require('../../../as/json');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

module.exports = TestClient;

// TestClient is a helper for tests that makes it easy to
// send messages to applications
function TestClient(opts) {
    if (!(this instanceof TestClient)) {
        return new TestClient(opts);
    }

    var self = this;

    self.app = opts.app;
    self.hostPort = opts.app.hostPort;

    // The tchannel for this TestClient is internal.
    // Its a tchannel created purely for the purposes of
    // being able to send messages.
    self.channel = TChannel();
    self._client = self.channel.makeSubChannel({
        serviceName: 'test-client'
    });

    self.tchannelJSON = TChannelJSON({
        logger: opts.logger
    });
}

inherits(TestClient, EventEmitter);

function jsonSend(testClient, opts, cb) {
    testClient._client.waitForIdentified({
        host: testClient.hostPort
    }, onIdentified);

    function onIdentified(err) {
        if (err) {
            return cb(err);
        }

        var req = testClient._client.request({
            host: testClient.hostPort,
            serviceName: opts.serviceName,
            hasNoParent: true,
            timeout: opts.timeout || 1000,
            headers: {
                'cn': 'test-client'
            }
        });

        testClient.tchannelJSON.send(
            req, opts.endpoint, opts.head, opts.body, cb
        );
    }
}

TestClient.prototype.getHosts = function getHosts(body, cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'hosts_v1',
        serviceName: 'autobahn',
        head: null,
        body: body
    }, cb);
};

TestClient.prototype.getConnections = function getConnections(body, cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'connections_v1',
        serviceName: 'autobahn',
        head: null,
        body: body
    }, cb);
};

TestClient.prototype.sendHealth = function sendHealth(cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'health_v1',
        serviceName: 'autobahn',
        head: null,
        body: null
    }, cb);
};

TestClient.prototype.sendSetK = function sendSetK(body, cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'set_k_v1',
        serviceName: 'autobahn',
        head: null,
        body: body
    }, cb);
};

TestClient.prototype.sendKillSwitch = function sendKillSwitch(body, cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'kill_switch_v1',
        serviceName: 'autobahn',
        head: null,
        body: body
    }, cb);
};

TestClient.prototype.sendHeapDump = function sendHeapDump(cb) {
    var self = this;

    jsonSend(self, {
        endpoint: 'heap_dump_v1',
        serviceName: 'autobahn',
        head: null,
        body: null,
        timeout: 10000
    }, cb);
};

TestClient.prototype.destroy = function destroy() {
    var self = this;

    self.channel.close();
};
