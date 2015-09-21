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

var tape = require('tape');
var inherits = require('inherits');
var shallowExtend = require('xtend');
var nodeAssert = require('assert');
var path = require('path');
var StaticConfig = require('static-config');

var Application = require('../../app.js');
var TestRing = require('./test-ring.js');
var TestClient = require('./test-client.js');
var getPeerInfo = require('../../peer-info.js');

module.exports = TestApplication;

// The TestApplication module is a set of utilities that
// make writing integration tests easier.
// The point is to make integration tests consistent without
// having to reach into the internals of the application.
function TestApplication(opts) {
    if (!(this instanceof TestApplication)) {
        return new TestApplication(opts);
    }

    var self = this;

    opts = opts || {};
    opts.seedConfig = shallowExtend(opts.seedConfig || {});
    opts.processTitle = 'test-hyperbahn';
    opts.argv = opts.argv || {};
    if (typeof opts.argv.port === 'undefined') {
        opts.argv.port = 0;
    }
    if (typeof opts.argv.controlPort === 'undefined') {
        opts.argv.controlPort = 0;
    }

    // Default tracing to off for test application
    opts.seedConfig.trace = !!opts.trace;

    opts.clients = opts.clients || {};
    nodeAssert(opts.clients.logger, 'expected a logger');

    var configDir = path.join(__dirname, '..', '..', 'config');
    var config = StaticConfig({
        files: [
            path.join(configDir, 'production.json'),
            path.join(configDir, 'local.json')
        ],
        seedConfig: opts.seedConfig
    });

    Application.call(self, config, {
        seedConfig: opts.seedConfig,
        clients: opts.clients,
        argv: opts.argv,
        serviceReqDefaults: opts.serviceReqDefaults,
        servicePurgePeriod: opts.servicePurgePeriod,
        period: opts.period,
        maxErrorRate: opts.maxErrorRate,
        minRequests: opts.minRequests,
        probation: opts.probation,
        rateLimiterBuckets: opts.rateLimiterBuckets,
        processTitle: opts.processTitle
    });

    // The client is initialized once the application has
    // a valid hostPort
    self.client = null;

    // Initialized after listen.
    self.hostPort = null;

    self.ring = TestRing(self);
}

inherits(TestApplication, Application);

TestApplication.test = test;

// Sets up everything but ringpop because we have to wait for the listen(0) to
// know what port it's on
TestApplication.prototype.partialBootstrap =
function partialBootstrap(listener) {
    var self = this;

    self.isBootstrapped = true;

    self.setupServices();
    self.clients.setupChannel(onReady);

    function onReady(err) {
        if (err) {
            return self.emit('error', err);
        }

        self.clients.repl.setApp(self);

        self.hostPort = self.tchannel.hostPort;
        self.client = TestClient({
            app: self,
            logger: self.clients.logger
        });

        if (listener) {
            listener();
        }
    }
};

TestApplication.prototype.destroy = function destroy(opts) {
    var self = this;

    if (self.forceDestroyed) {
        // We were already destroyed
        return;
    }

    Application.prototype.destroy.call(self, opts);
    self.client.destroy();
};

TestApplication.prototype.exitsFor = function exitsFor(serviceName) {
    var self = this;
    return self.clients.egressNodes.exitsFor(serviceName);
};

TestApplication.prototype.hostsFor = function hostsFor(serviceName) {
    var self = this;
    return Object.keys(
        self.clients.egressNodes.exitsFor(serviceName)
    );
};

TestApplication.prototype.checkExitPeers =
function checkExitPeers(assert, opts) {
    nodeAssert(opts && opts.serviceName, 'serviceName required');
    nodeAssert(opts && opts.hostPort, 'hostPort required');

    var self = this;
    var peer = self.tchannel.peers.get(opts.hostPort);
    var peerInfo = peer && getPeerInfo(peer);

    // By default we expect all connections to be connected
    var expectedConnectedOut = true;
    // However allow for a disconnected hostPort blackList
    if (opts.disconnectedHostsPorts &&
        opts.disconnectedHostsPorts.indexOf(opts.hostPort) >= 0) {
        expectedConnectedOut = false;
    }

    if (opts.isDead) {
        assert.equal(
            peerInfo.serviceNames.length, 0,
            'peer has no services');
    } else if (expectedConnectedOut === false) {
        assert.ok(peer, 'peer exists on exitApp');
        assert.equal(peerInfo && peerInfo.connected.out, false,
            'exitApp is not connected to peer');
    } else {
        var connected = (peerInfo && peerInfo.connected.out) ||
            (peerInfo && peerInfo.connected.in);

        assert.ok(peer, 'peer exists on exitApp');
        assert.equal(connected, true,
            'exitApp is connected to peer');
    }
};

function test(testName, opts, fn) {
    if (typeof opts === 'function') {
        fn = opts;
        opts = {};
    }

    tape(testName, onAssert);

    function onAssert(assert) {
        assert.once('end', onEnd);

        var app = TestApplication(opts);

        app.bootstrapAndListen(onApp);

        function onApp() {
            fn(app, assert);
        }

        function onEnd() {
            app.destroy();
        }
    }
}
