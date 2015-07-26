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
var TChannel = require('../../');
var TChannelAsJSON = require('../../as/json');
var HyperbahnHandler = require('../handler');
var HyperbahnEgressNodes = require('../egress-nodes');
var ServiceProxy = require('../service_proxy.js');
var CountedReadySignal = require('ready-signal/counted');
var fs = require('fs');

var createLogger = require('./logger.js');
var createStatsd = require('./statsd.js');
var createProcessReporter = require('./process-reporter.js');
var createRepl = require('./repl.js');
var HeapDumper = require('./heap-dumper.js');

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
    self._host = config.get('clients.ringpop.host') || myLocalIp();
    self._port = config.get('port');

    self.config = config;

    self.statsd = options.seedClients.statsd ||
        createStatsd({
            project: config.get('project'),
            host: config.get('clients.uber-statsd-client.host'),
            port: config.get('clients.uber-statsd-client.port')
        });
    self.logger = options.seedClients.logger ||
        createLogger({
            team: config.get('team'),
            project: config.get('project'),
            kafka: config.get('clients.logtron.kafka'),
            logFile: config.get('clients.logtron.logFile'),
            console: config.get('clients.logtron.console'),
            sentry: config.get('clients.logtron.sentry'),
            statsd: self.statsd
        });
    /*eslint no-process-env: 0*/
    self.onError = uncaught({
        logger: self.logger,
        statsd: self.statsd,
        statsdKey: 'uncaught-exception',
        prefix: [
            config.get('project'),
            process.env.NODE_ENV,
            os.hostname().split('.')[0]
        ].join('.') + ' ',
        backupFile: config.get(
            'clients.uncaught-exception.backupFile'
        ),
        loggerTimeout: config.get(
            'clients.uncaught-exception.loggerTimeout'
        ),
        statsdTimeout: config.get(
            'clients.uncaught-exception.statsdTimeout'
        ),
        statsdWaitPeriod: config.get(
            'clients.uncaught-exception.statsdWaitPeriod'
        )
    });

    self.processReporter = createProcessReporter({
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

    self.ringpop = RingPop({
        app: self.config.get('project'),
        hostPort: self._host + ':' + self._port,
        channel: self.ringpopChannel,
        logger: self.logger,
        statsd: self.statsd,
        pingReqTimeout: config.get('clients.ringpop.pingReqTimeout'),
        pingTimeout: config.get('clients.ringpop.pingTimeout'),
        joinTimeout: config.get('clients.ringpop.joinTimeout')
    });
    self.egressNodes = HyperbahnEgressNodes({
        ringpop: self.ringpop,
        defaultKValue: self.config.get('core.exitNode.k')
    });

    self.hyperbahnChannel = self.tchannel.makeSubChannel({
        serviceName: 'hyperbahn',
        trace: false
    });
    self.hyperbahnHandler = HyperbahnHandler({
        channel: self.hyperbahnChannel,
        ringpop: self.ringpop,
        egressNodes: self.egressNodes,
        callerName: 'autobahn',
        relayAdTimeout: config.get('hyperbahn.relayAdTimeout')
    });
    self.hyperbahnHandler.advertise =
    function advertise(serviceObj) {
        self.tchannel.handler.refreshServicePeer(serviceObj.serviceName, serviceObj.hostPort);
    };
    self.hyperbahnChannel.handler = self.hyperbahnHandler;

    // Circuit health monitor and control
    var circuitsConfig = {
        enabled: self.config.get('circuits.enabled'),
        period: self.config.get('circuits.period'),
        maxErrorRate: self.config.get('circuits.maxErrorRate'),
        minRequests: self.config.get('circuits.minRequests'),
        probation: self.config.get('circuits.probation')
    };

    var serviceProxyOpts = {
        channel: self.tchannel,
        config: self.config,
        logger: self.logger,
        statsd: self.statsd,
        egressNodes: self.egressNodes,
        servicePurgePeriod: options.servicePurgePeriod,
        serviceReqDefaults: options.serviceReqDefaults,
        rateLimiterEnabled: config.get('rateLimiting.enabled'),
        totalRpsLimit: config.get('rateLimiting.totalRpsLimit'),
        exemptServices: config.get('rateLimiting.exemptServices'),
        defaultServiceRpsLimit: config.get('rateLimiting.defaultServiceRpsLimit'),
        rpsLimitForServiceName: config.get('rateLimiting.rpsLimitForServiceName'),
        rateLimiterBuckets: config.get('rateLimiting.rateLimiterBuckets'),
        circuitsConfig: circuitsConfig
    };

    self.serviceProxy = ServiceProxy(serviceProxyOpts);
    self.tchannel.handler = self.serviceProxy;

    self.heapDumper = HeapDumper({
        heapFolder: config.get('server.heapsnapshot.folder'),
        logger: self.logger
    });

    // Special case services
    self.egressNodes.setKValueFor('tcollector', 100);
    self.egressNodes.setKValueFor('onedirection', 60);
}

ApplicationClients.prototype.loadHostList = function loadHostList() {
    var self = this;

    var bootFile = self.config.get('clients.ringpop.bootstrapFile');
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

    self._controlServer.listen(
        self.config.get('controlPort'), listenReady.signal
    );

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
    self.ringpop.destroy();
    if (!self.tchannel.destroyed) {
        self.tchannel.close();
    }
    self.processReporter.destroy();

    self.repl.close();
    self._controlServer.close();
};
