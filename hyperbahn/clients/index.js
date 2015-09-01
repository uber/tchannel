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
var http = require('http');
// TODO use better module. This sometimes fails when you
// move around and change wifi networks.
var myLocalIp = require('my-local-ip');
var os = require('os');
var RingPop = require('ringpop');
var process = require('process');
var uncaught = require('uncaught-exception');
var TChannel = require('tchannel');
var TChannelAsJSON = require('tchannel/as/json');
var HyperbahnHandler = require('tchannel/hyperbahn/handler');
var HyperbahnEgressNodes = require('tchannel/hyperbahn/egress-nodes');
var ServiceProxy = require('tchannel/hyperbahn/service_proxy.js');
var CountedReadySignal = require('ready-signal/counted');
var fs = require('fs');
var ProcessReporter = require('process-reporter');
var NullStatsd = require('uber-statsd-client/null');

var createLogger = require('./logger.js');
var DualStatsd = require('./dual-statsd.js');
var createRepl = require('./repl.js');
var HeapDumper = require('./heap-dumper.js');
var RemoteConfig = require('./remote-config.js');

module.exports = ApplicationClients;

function ApplicationClients(options) {
    /*eslint max-statements: [2, 40] */
    if (!(this instanceof ApplicationClients)) {
        return new ApplicationClients(options);
    }

    var self = this;
    var config = options.config;

    // We need to move away from myLocalIp(); this fails in weird
    // ways when moving around and changing wifi networks.
    // host & port are internal fields since they are just used
    // in bootstrap and are not actually client objects.
    self._host = config.get('tchannel.host') || myLocalIp();
    self._port = options.argv.port;
    self._controlPort = options.argv.controlPort;
    self._bootFile = options.argv.bootstrapFile !== undefined ?
        JSON.parse(options.argv.bootstrapFile) :
        config.get('hyperbahn.ringpop.bootstrapFile');

    var statsOptions = config.get('clients.uber-statsd-client');
    self.statsd = options.seedClients.statsd || (
        (statsOptions && statsOptions.host && statsOptions.port) ?
            DualStatsd({
                host: statsOptions.host,
                port: statsOptions.port,
                project: config.get('info.project'),
                processTitle: options.processTitle
            }) :
            NullStatsd()
    );
    self.logger = options.seedClients.logger ||
        createLogger({
            team: config.get('info.team'),
            project: config.get('info.project'),
            kafka: config.get('clients.logtron.kafka'),
            logFile: config.get('clients.logtron.logFile'),
            console: config.get('clients.logtron.console'),
            sentry: config.get('clients.logtron.sentry'),
            statsd: self.statsd
        });

    /*eslint no-process-env: 0*/
    var uncaughtTimeouts = config.get('clients.uncaught-exception.timeouts');
    self.onError = uncaught({
        logger: self.logger,
        statsd: self.statsd,
        statsdKey: 'uncaught-exception',
        prefix: [
            config.get('info.project'),
            process.env.NODE_ENV,
            os.hostname().split('.')[0]
        ].join('.') + ' ',
        backupFile: config.get('clients.uncaught-exception.file'),
        loggerTimeout: uncaughtTimeouts.loggerTimeout,
        statsdTimeout: uncaughtTimeouts.statsdTimeout,
        statsdWaitPeriod: uncaughtTimeouts.statsdWaitPeriod
    });

    self.processReporter = ProcessReporter({
        statsd: self.statsd
    });

    // This is dead code; really really soon.
    // Need HTTP server or I get fucking paged at 5am
    // Fix the nagios LOL.
    self._controlServer = http.createServer(onRequest);
    function onRequest(req, res) {
        res.end('OK');
    }

    // Store the tchannel object with its peers on clients
    // Also store a json sender and a raw sender
    self.tchannel = TChannel({
        statTags: {
            app: 'autobahn',
            host: os.hostname()
        },
        emitConnectionMetrics: false,
        connectionStalePeriod: 1.5 * 1000,
        trace: false,
        logger: self.logger,
        statsd: self.statsd
    });

    self.autobahnHostPortList = self.loadHostList();

    self.tchannelJSON = TChannelAsJSON({
        logger: self.logger
    });
    self.repl = createRepl();

    self.autobahnChannel = self.tchannel.makeSubChannel({
        serviceName: 'autobahn'
    });
    self.ringpopChannel = self.tchannel.makeSubChannel({
        trace: false,
        serviceName: 'ringpop'
    });

    var ringpopTimeouts = config.get('hyperbahn.ringpop.timeouts');
    self.ringpop = RingPop({
        app: config.get('info.project'),
        hostPort: self._host + ':' + self._port,
        channel: self.ringpopChannel,
        logger: self.logger,
        statsd: self.statsd,
        pingReqTimeout: ringpopTimeouts.pingReqTimeout,
        pingTimeout: ringpopTimeouts.pingTimeout,
        joinTimeout: ringpopTimeouts.joinTimeout
    });
    self.egressNodes = HyperbahnEgressNodes({
        ringpop: self.ringpop,
        defaultKValue: 10
    });

    var hyperbahnTimeouts = config.get('hyperbahn.timeouts');
    self.hyperbahnChannel = self.tchannel.makeSubChannel({
        serviceName: 'hyperbahn',
        trace: false
    });
    self.hyperbahnHandler = HyperbahnHandler({
        channel: self.hyperbahnChannel,
        ringpop: self.ringpop,
        egressNodes: self.egressNodes,
        callerName: 'autobahn',
        relayAdTimeout: hyperbahnTimeouts.relayAdTimeout
    });
    self.hyperbahnChannel.handler = self.hyperbahnHandler;

    // Circuit health monitor and control
    var circuitsConfig = config.get('hyperbahn.circuits');

    var serviceProxyOpts = {
        channel: self.tchannel,
        logger: self.logger,
        statsd: self.statsd,
        egressNodes: self.egressNodes,
        servicePurgePeriod: options.servicePurgePeriod,
        serviceReqDefaults: options.serviceReqDefaults,
        rateLimiterEnabled: false,
        rateLimiterBuckets: options.rateLimiterBuckets,
        circuitsConfig: circuitsConfig
    };

    self.serviceProxy = ServiceProxy(serviceProxyOpts);
    self.tchannel.handler = self.serviceProxy;

    self.heapDumper = HeapDumper({
        heapFolder: config.get('clients.heapsnapshot').folder,
        logger: self.logger
    });

    self.remoteConfig = RemoteConfig({
        configFile: config.get('clients.remote-config.file'),
        pollInterval: config.get('clients.remote-config').pollInterval,
        logger: self.logger,
        logError: config.get('clients.remote-config.logError')
    });
    self.remoteConfig.on('update', onRemoteConfigUpdate);
    // initlialize to default
    self.onRemoteConfigUpdate();
    self.remoteConfig.loadSync();
    self.remoteConfig.startPolling();

    function onRemoteConfigUpdate() {
        self.onRemoteConfigUpdate();
    }
}

ApplicationClients.prototype.loadHostList = function loadHostList() {
    var self = this;

    var bootFile = self._bootFile;
    var autobahnHostPortList;

    if (Array.isArray(bootFile)) {
        return bootFile;
    }

    try {
        // load sync because startup
        autobahnHostPortList = JSON.parse(fs.readFileSync(bootFile, 'utf8'));
    } catch (e) {
        return null;
    }

    return autobahnHostPortList;
};

ApplicationClients.prototype.bootstrap =
function bootstrap(cb) {
    var self = this;

    assert(typeof cb === 'function', 'cb required');

    var listenReady = CountedReadySignal(3);
    listenReady(onListen);

    self.processReporter.bootstrap();
    self.ringpop.setupChannel();

    self.tchannel.on('listening', listenReady.signal);
    self.tchannel.listen(self._port, self._host);

    self.repl.once('listening', listenReady.signal);
    self.repl.start();

    self._controlServer.listen(self._controlPort, listenReady.signal);

    function onListen() {
        if (self.autobahnHostPortList) {
            self.ringpop.bootstrap(self.autobahnHostPortList, cb);
        } else {
            process.nextTick(cb);
        }
    }
};

ApplicationClients.prototype.destroy = function destroy() {
    var self = this;

    self.serviceProxy.destroy();
    self.remoteConfig.destroy();
    self.ringpop.destroy();
    if (!self.tchannel.destroyed) {
        self.tchannel.close();
    }
    self.processReporter.destroy();

    self.repl.close();
    self._controlServer.close();
};

ApplicationClients.prototype.onRemoteConfigUpdate = function onRemoteConfigUpdate() {
    var self = this;
    self.updateCircuitsEnabled();
    self.updateCircuitTestServiceName();
    self.updateRateLimitingEnabled();
    self.updateTotalRpsLimit();
    self.updateExemptServices();
    self.updateRpsLimitForServiceName();
    self.updateKValues();
};

ApplicationClients.prototype.updateCircuitsEnabled = function updateCircuitsEnabled() {
    var self = this;
    var enabled = self.remoteConfig.get('circuits.enabled', false);
    if (enabled) {
        self.serviceProxy.enableCircuits();
    } else {
        self.serviceProxy.disableCircuits();
    }
};

ApplicationClients.prototype.updateCircuitTestServiceName = function updateCircuitTestServiceName() {
    var self = this;
    var serviceName = self.remoteConfig.get('circuits.testServiceName', null);
    if (serviceName) {
        self.serviceProxy.enableCircuitTestService(serviceName);
    } else {
        self.serviceProxy.disableCircuitTestService();
    }
};

ApplicationClients.prototype.updateRateLimitingEnabled = function updateRateLimitingEnabled() {
    var self = this;
    var enabled = self.remoteConfig.get('rateLimiting.enabled', false);
    if (enabled) {
        self.serviceProxy.enableRateLimiter();
    } else {
        self.serviceProxy.disableRateLimiter();
    }
};

ApplicationClients.prototype.updateTotalRpsLimit = function updateTotalRpsLimit() {
    var self = this;
    var limit = self.remoteConfig.get('rateLimiting.totalRpsLimit', 1200);
    self.serviceProxy.rateLimiter.updateTotalLimit(limit);
};

ApplicationClients.prototype.updateExemptServices = function updateExemptServices() {
    var self = this;
    var exemptServices = self.remoteConfig.get('rateLimiting.exemptServices', ['autobahn', 'ringpop']);
    self.serviceProxy.rateLimiter.updateExemptServices(exemptServices);
};

ApplicationClients.prototype.updateRpsLimitForServiceName = function updateRpsLimitForServiceName() {
    var self = this;
    var rpsLimitForServiceName = self.remoteConfig.get('rateLimiting.rpsLimitForServiceName', {});
    self.serviceProxy.rateLimiter.updateRpsLimitForAllServices(rpsLimitForServiceName);
};

ApplicationClients.prototype.updateKValues = function updateKValues() {
    var self = this;
    var defaultKValue = self.remoteConfig.get('kValue.default', 10);
    self.egressNodes.setDefaultKValue(defaultKValue);

    var serviceKValues = self.remoteConfig.get('kValue.services', {});
    var keys = Object.keys(serviceKValues);
    for (var i = 0; i < keys.length; i++) {
        var serviceName = keys[i];
        var kValue = serviceKValues[serviceName];
        self.egressNodes.setKValueFor(serviceName, kValue);
        self.serviceProxy.updateServiceChannels();
    }
};
