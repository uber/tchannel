'use strict';

var tape = require('tape');
var inherits = require('inherits');
var shallowExtend = require('xtend');
var nodeAssert = require('assert');

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
    if (typeof opts.seedConfig.port === 'undefined') {
        opts.seedConfig.port = 0;
    }
    if (typeof opts.seedConfig.controlPort === 'undefined') {
        opts.seedConfig.controlPort = 0;
    }

    // Default tracing to off for test application
    opts.seedConfig.trace = !!opts.trace;

    if (typeof opts.kValue === 'number') {
        opts.seedConfig.core = opts.seedConfig.core || {};
        opts.seedConfig.core.exitNode =
            opts.seedConfig.core.exitNode || {};
        opts.seedConfig.core.exitNode.k = opts.kValue;
    }

    opts.clients = opts.clients || {};
    nodeAssert(opts.clients.logger, 'expected a logger');

    Application.call(self, {
        seedConfig: opts.seedConfig,
        clients: opts.clients,
        serviceReqDefaults: opts.serviceReqDefaults,
        servicePurgePeriod: opts.servicePurgePeriod,
        period: opts.period,
        maxErrorRate: opts.maxErrorRate,
        minRequests: opts.minRequests,
        probation: opts.probation
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

TestApplication.prototype.bootstrapAndListen =
function bootstrapAndListen(listener) {
    var self = this;

    Application.prototype.bootstrapAndListen.call(self, onReady);

    function onReady(err) {
        if (err) {
            return self.emit('error', err);
        }

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
