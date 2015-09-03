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
var fs = require('fs');
var path = require('path');

var TChannel = require('tchannel');
var TChannelJSON = require('tchannel/as/json');
var TChannelThrift = require('tchannel/as/thrift');
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

function thriftSend(testClient, opts, thriftSource, cb) {
    var thrift = new TChannelThrift({source: thriftSource});
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

        thrift.send(req,
            opts.endpoint,
            opts.head,
            opts.body,
            cb);
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

TestClient.prototype.sendHealthThrift = function sendHealthThrift(cb) {
    var self = this;
    var healthSpec = fs.readFileSync(path.join(__dirname, '../../node_modules/tchannel/as/meta.thrift'), 'utf8');

    thriftSend(self, {
        endpoint: 'Meta::health',
        serviceName: 'autobahn',
        head: null,
        body: null
    }, healthSpec, cb);
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
