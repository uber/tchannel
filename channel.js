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
var globalTimers = {
    setTimeout: require('timers').setTimeout,
    clearTimeout: require('timers').clearTimeout,
    now: Date.now
};
var globalRandom = Math.random;
var net = require('net');
var format = require('util').format;
var extend = require('xtend');

var inherits = require('util').inherits;
var StatEmitter = require('./lib/stat_emitter');

var nullLogger = require('./null-logger.js');
var EndpointHandler = require('./endpoint-handler.js');
var TChannelRequest = require('./request');
var TChannelServiceNameHandler = require('./service-name-handler');
var errors = require('./errors');

var BaseStat = require('./lib/stat.js').BaseStat;
var TChannelAsThrift = require('./as/thrift');
var TChannelAsJSON = require('./as/json');
var TChannelConnection = require('./connection');
var TChannelRootPeers = require('./root_peers');
var TChannelSubPeers = require('./sub_peers');
var TChannelServices = require('./services');
var TChannelStatsd = require('./lib/statsd');
var RetryFlags = require('./retry-flags.js');
var TimeHeap = require('./time_heap');
var CountedReadySignal = require('ready-signal/counted');

var TracingAgent = require('./trace/agent');

var CONN_STALE_PERIOD = 1500;
var SANITY_PERIOD = 10 * 1000;
var STAT_EMIT_PERIOD = 100;
var DEFAULT_RETRY_FLAGS = new RetryFlags(
    /*never:*/ false,
    /*onConnectionError*/ true,
    /*onTimeout*/ false
);

function StatTags(statTags) {
    var self = this;

    self.app = statTags.app || '';
    self.host = statTags.host || '';
    self.cluster = statTags.cluster || '';
    self.version = statTags.version || '';
}

// TODO restore spying
// var Spy = require('./v2/spy');
// var dumpEnabled = /\btchannel_dump\b/.test(process.env.NODE_DEBUG || '');

function TChannel(options) {
    if (!(this instanceof TChannel)) {
        return new TChannel(options);
    }

    var self = this;
    StatEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.listeningEvent = self.defineEvent('listening');
    self.connectionEvent = self.defineEvent('connection');

    // self.outboundCallsSentStat = self.defineCounter('outbound.calls.sent');
    // self.outboundCallsSuccessStat = self.defineCounter('outbound.calls.success');
    self.outboundCallsSystemErrorsStat = self.defineCounter('tchannel.outbound.calls.system-errors');
    self.outboundCallsPerAttemptSystemErrorsStat = self.defineCounter('tchannel.outbound.calls.per-attempt.system-errors');
    self.outboundCallsOperationalErrorsStat = self.defineCounter('tchannel.outbound.calls.operational-errors');
    self.outboundCallsPerAttemptOperationalErrorsStat = self.defineCounter('tchannel.outbound.calls.per-attempt.operational-errors');
    // self.outboundCallsAppErrorsStat = self.defineCounter('outbound.calls.app-errors');
    // self.outboundCallsPerAttemptAppErrorsStat = self.defineCounter('outbound.calls.per-attempt.app-errors');
    self.outboundCallsRetriesStat = self.defineCounter('tchannel.outbound.calls.retries');
    // self.outboundResponseSizeStat = self.defineCounter('outbound.response.size');
    // self.outboundCallsLatencyStat = self.defineTiming('outbound.calls.latency');
    // self.outboundCallsPerAttemptLatencyStat = self.defineTiming('outbound.calls.per-attempt-latency');

    // self.inboundCallsSuccessStat = self.defineCounter('inbound.calls.success');
    self.inboundCallsSystemErrorsStat = self.defineCounter('tchannel.inbound.calls.system-errors');
    // self.inboundCallsAppErrorsStat = self.defineCounter('inbound.calls.app-errors');
    // self.inboundCallsCancelsRequestedStat = self.defineCounter('inbound.cancels.requested');
    // self.inboundCallsCancelsHonoredStat = self.defineCounter('inbound.cancels.honored');
    // self.inboundRequestSizeStat = self.defineCounter('inbound.request.size');
    // self.inboundResponseSizeStat = self.defineCounter('inbound.response.size');
    self.inboundProtocolErrorsStat = self.defineCounter('tchannel.inbound.protocol-errors');
    // self.inboundCallsLatencyStat = self.defineTiming('inbound.calls.latency');

    self.connectionsActiveStat = self.defineGauge('tchannel.connections.active');
    self.connectionsInitiatedStat = self.defineCounter('tchannel.connections.initiated');
    self.connectionsConnectErrorsStat = self.defineCounter('tchannel.connections.connect-errors');
    self.connectionsAcceptedStat = self.defineCounter('tchannel.connections.accepted');
    self.connectionsAcceptedErrorsStat = self.defineCounter('tchannel.connections.accept-errors');
    self.connectionsErrorsStat = self.defineCounter('tchannel.connections.errors');
    self.connectionsClosedStat = self.defineCounter('tchannel.connections.closed');
    // self.connectionsBytesRcvdStat = self.defineCounter('connections.bytes-recvd');

    self.options = extend({
        useLazyHandling: false,
        timeoutCheckInterval: 100,
        timeoutFuzz: 100,
        connectionStalePeriod: CONN_STALE_PERIOD,

        // TODO: maybe we should always add pid to user-supplied?
        processName: format('%s[%s]', process.title, process.pid)
    }, options);

    self.logger = self.options.logger || nullLogger;
    self.random = self.options.random || globalRandom;
    self.timers = self.options.timers || globalTimers;
    self.initTimeout = self.options.initTimeout || 2000;
    self.requireAs = self.options.requireAs;
    self.requireCn = self.options.requireCn;
    self.emitConnectionMetrics =
        typeof self.options.emitConnectionMetrics === 'boolean' ?
        self.options.emitConnectionMetrics : false;
    self.choosePeerWithHeap = self.options.choosePeerWithHeap || false;

    // required: 'app'
    // optional: 'host', 'cluster', 'version'
    assert(!self.options.statTags || self.options.statTags.app, 'the stats must have the "app" tag');
    self.statTags = new StatTags(self.options.statTags || {});

    self.statsd = self.options.statsd;
    if (self.statsd) {
        self.channelStatsd = new TChannelStatsd(self, self.statsd);
        self.options.statsd = null;
    }

    // Filled in by the listen call:
    self.host = null;
    self.requestedPort = null;

    // Filled in by listening event:
    self.hostPort = null;

    // name of the service running over this channel
    self.serviceName = '';
    if (self.options.serviceName) {
        self.serviceName = self.options.serviceName;
        delete self.options.serviceName;
    }

    self.topChannel = self.options.topChannel || null;
    self.subChannels = self.topChannel ? null : {};

    // for processing operation timeouts
    self.timeHeap = self.options.timeHeap || new TimeHeap({
        timers: self.timers,
        // TODO: do we still need/want fuzzing?
        minTimeout: fuzzedMinTimeout
    });

    function fuzzedMinTimeout() {
        var fuzz = self.options.timeoutFuzz;
        if (fuzz) {
            fuzz = Math.floor(fuzz * (self.random() - 0.5));
        }
        return self.options.timeoutCheckInterval + fuzz;
    }

    // how to handle incoming requests
    if (!self.options.handler) {
        if (!self.serviceName) {
            self.handler = TChannelServiceNameHandler({
                channel: self,
                isBusy: self.options.isBusy
            });
        } else {
            self.handler = EndpointHandler(self.serviceName);
        }
    } else {
        self.handler = self.options.handler;
        delete self.options.handler;
    }

    // populated by:
    // - manually api (.peers.add etc)
    // - incoming connections on any listening socket

    if (!self.topChannel) {
        self.peers = TChannelRootPeers(self, self.options);
    } else {
        self.peers = TChannelSubPeers(self, self.options);
    }

    // For tracking the number of pending requests to any service
    self.services = new TChannelServices();
    if (self.options.maxPending !== undefined) {
        self.services.maxPending = self.options.maxPending;
    }
    if (self.options.maxPendingForService !== undefined) {
        self.services.maxPendingForService = self.options.maxPendingForService;
    }

    // TChannel advances through the following states.
    self.listened = false;
    self.listening = false;
    self.destroyed = false;
    self.draining = false;

    // set when draining (e.g. graceful shutdown)
    self.drainReason = '';
    self.drainExempt = null;

    var trace = typeof self.options.trace === 'boolean' ?
        self.options.trace : true;

    if (trace) {
        self.tracer = new TracingAgent({
            logger: self.logger,
            forceTrace: self.options.forceTrace,
            serviceName: self.options.serviceNameOverwrite,
            reporter: self.options.traceReporter
        });
    }

    if (typeof self.options.traceSample === 'number') {
        self.traceSample = self.options.traceSample;
    } else {
        self.traceSample = 0.01;
    }

    // lazily created by .getServer (usually from .listen)
    self.serverSocket = null;
    self.serverConnections = null;

    self.TChannelAsThrift = TChannelAsThrift;
    self.TChannelAsJSON = TChannelAsJSON;

    self.statsQueue = [];

    self.requestDefaults = self.options.requestDefaults ?
        new RequestDefaults(self.options.requestDefaults) : null;

    if (!self.topChannel) {
        self.sanityTimer = self.timers.setTimeout(doSanitySweep, SANITY_PERIOD);
        self.flushStats();
    }

    function doSanitySweep() {
        self.sanityTimer = null;
        self.sanitySweep();
        self.sanityTimer = self.timers.setTimeout(doSanitySweep, SANITY_PERIOD);
    }
}
inherits(TChannel, StatEmitter);

TChannel.prototype.eachConnection = function eachConnection(each) {
    var self = this;

    var peers = self.peers.values();
    var i;
    for (i = 0; i < peers.length; i++) {
        var peer = peers[i];
        for (var j = 0; j < peer.connections.length; j++) {
            each(peer.connections[j]);
        }
    }

    if (self.serverConnections) {
        var connKeys = Object.keys(self.serverConnections);
        for (i = 0; i < connKeys.length; i++) {
            each(self.serverConnections[connKeys[i]]);
        }
    }
};

TChannel.prototype.setLazyHandling = function setLazyHandling(enabled) {
    var self = this;

    if (self.topChannel) {
        self.topChannel.setLazyHandling(enabled);
        return;
    }

    self.options.useLazyHandling = enabled;
    self.eachConnection(updateEachConn);

    function updateEachConn(conn) {
        conn.setLazyHandling(enabled);
    }
};

TChannel.prototype.drain = function drain(reason, exempt, callback) {
    var self = this;

    // TODO: we could do this by defaulting and/or forcing you into an
    // exemption function that exempting anything not matching the given sub
    // channel's service name; however there are many other complications to
    // consider to implement sub channel draining, so for now:
    assert(!self.topChannel, 'sub channel draining not supported');
    assert(!self.draining, 'channel already draining');

    if (callback === undefined) {
        callback = exempt;
        exempt = null;
    }

    self.draining = true;
    self.drainReason = reason;
    self.drainExempt = exempt;

    var drained = CountedReadySignal(1);
    drained(callback);
    self.eachConnection(drainEachConn);
    process.nextTick(drained.signal);
    self.logger.info('draining channel', {
        hostPort: self.hostPort,
        reason: self.drainReason,
        count: drained.counter
    });

    function drainEachConn(conn) {
        drained.counter++;
        conn.drain(self.drainReason, self.drainExempt, drained.signal);
    }
};

TChannel.prototype.getServer = function getServer() {
    var self = this;
    if (self.serverSocket) {
        return self.serverSocket;
    }

    self.serverConnections = Object.create(null);
    self.serverSocket = net.createServer(onServerSocketConnection);
    self.serverSocket.on('listening', onServerSocketListening);
    self.serverSocket.on('error', onServerSocketError);

    return self.serverSocket;

    function onServerSocketConnection(sock) {
        self.onServerSocketConnection(sock);
    }

    function onServerSocketListening() {
        self.onServerSocketListening();
    }

    function onServerSocketError(err) {
        self.onServerSocketError(err);
    }
};

TChannel.prototype.flushStats = function flushStats() {
    var self = this;

    if (self.batchStatTimer) {
        self.timers.clearTimeout(self.batchStatTimer);
    }

    for (var i = 0; i < self.statsQueue.length; i++) {
        self.statEvent.emit(self, self.statsQueue[i]);
    }
    self.statsQueue = [];

    self.batchStatTimer = self.timers.setTimeout(
        flushStatsRecur, STAT_EMIT_PERIOD
    );

    function flushStatsRecur() {
        self.flushStats();
    }
};

TChannel.prototype.onServerSocketConnection = function onServerSocketConnection(sock) {
    var self = this;

    if (self.destroyed) {
        self.logger.error('got incoming socket whilst destroyed', {
            remoteAddress: sock.remoteAddress,
            remotePort: sock.remotePort,
            hostPort: self.hostPort
        });
        return;
    }

    var socketRemoteAddr = sock.remoteAddress + ':' + sock.remotePort;
    var chan = self.topChannel || self;
    var conn = new TChannelConnection(chan, sock, 'in', socketRemoteAddr);

    if (self.draining) {
        conn.drain(self.drainReason, self.drainExempt, null);
    }

    conn.errorEvent.on(onConnectionError);

    if (self.serverConnections[socketRemoteAddr]) {
        var oldConn = self.serverConnections[socketRemoteAddr];
        oldConn.resetAll(errors.SocketClosedError({
            reason: 'duplicate socketRemoteAddr incoming conn'
        }));
        delete self.serverConnections[socketRemoteAddr];
    }

    sock.on('close', onSocketClose);

    self.serverConnections[socketRemoteAddr] = conn;
    self.connectionEvent.emit(self, conn);

    function onSocketClose() {
        delete self.serverConnections[socketRemoteAddr];
    }

    // TODO: move method
    function onConnectionError(err) {
        var codeName = errors.classify(err);

        var loggerInfo = {
            error: err,
            direction: conn.direction,
            remoteName: conn.remoteName,
            socketRemoteAddr: conn.socketRemoteAddr
        };

        if (codeName === 'Timeout') {
            self.logger.warn('Got a connection error', loggerInfo);
        } else {
            self.logger.error('Got an unexpected connection error', loggerInfo);
        }
        delete self.serverConnections[socketRemoteAddr];
    }
};

TChannel.prototype.onServerSocketListening = function onServerSocketListening() {
    var self = this;

    var address = self.serverSocket.address();
    var hostPort = self.host + ':' + address.port;

    if (self.destroyed) {
        self.logger.error('got serverSocket listen whilst destroyed', {
            requestedPort: self.requestedPort,
            hostPort: hostPort
        });
        return;
    }

    self.hostPort = hostPort;
    self.listening = true;

    if (self.subChannels) {
        var subChanNames = Object.keys(self.subChannels);
        for (var i = 0; i < subChanNames.length; i++) {
            var chan = self.subChannels[subChanNames[i]];
            if (!chan.hostPort) {
                chan.hostPort = self.hostPort;
            }
        }
    }

    self.listeningEvent.emit(self);
};

TChannel.prototype.onServerSocketError = function onServerSocketError(err) {
    var self = this;

    if (err.code === 'EADDRINUSE') {
        err = errors.TChannelListenError(err, {
            requestedPort: self.requestedPort,
            host: self.host
        });
    }
    self.logger.error('server socket error', {
        error: err,
        requestedPort: self.requestedPort,
        host: self.host,
        hostPort: self.hostPort || null
    });
    self.errorEvent.emit(self, err);
};

TChannel.prototype.makeSubChannel = function makeSubChannel(options) {
    var self = this;
    if (!options) options = {};
    assert(!self.serviceName, 'arbitrary-depth sub channels are unsupported');
    assert(options.serviceName, 'must specify serviceName');
    assert(!self.subChannels[options.serviceName], 'duplicate sub channel creation');
    var opts = extend(self.options);
    var keys = Object.keys(options);
    for (var i = 0; i < keys.length; i++) {
        switch (keys[i]) {
            case 'peers':
                break;
            default:
                opts[keys[i]] = options[keys[i]];
        }
    }

    opts.topChannel = self;
    opts.timeHeap = self.timeHeap;
    var chan = TChannel(opts);

    if (options.peers) {
        for (i = 0; i < options.peers.length; i++) {
            if (typeof options.peers[i] === 'string') {
                chan.peers.add(options.peers[i]);
            }
        }
    }
    self.subChannels[chan.serviceName] = chan;

    // Subchannels should not have tracers; all tracing goes
    // through the top channel.
    chan.tracer = self.tracer;

    if (self.hostPort) {
        chan.hostPort = self.hostPort;
    }

    return chan;
};

TChannel.prototype.listen = function listen(port, host, callback) {
    // Note:
    // - 0 is a valid port number, indicating that the system must assign an
    //   available ephemeral port
    // - 127.0.0.1 is a valid host, primarily for testing
    var self = this;
    assert(!self.listened, 'TChannel can only listen once');
    assert(typeof host === 'string', 'TChannel requires host argument');
    assert(typeof port === 'number', 'TChannel must listen with numeric port');
    assert(host !== '0.0.0.0', 'TChannel must listen with externally visible host');
    self.listened = true;
    self.requestedPort = port;
    self.host = host;
    self.getServer().listen(port, host, callback);
};

TChannel.prototype.register = function register(name, options, handler) {
    var self = this;

    var handlerType = self.handler && self.handler.type;

    switch (handlerType) {
        case 'tchannel.endpoint-handler':
            self.handler.register(name, options, handler);
            break;

        case 'tchannel.service-name-handler':
            throw errors.TopLevelRegisterError();

        default:
            if (typeof self.handler.register === 'function') {
                self.handler.register(name, options, handler);
            } else {
                throw errors.InvalidHandlerForRegister({
                    handlerType: handlerType,
                    handler: self.handler
                });
            }
    }
};

TChannel.prototype.address = function address() {
    var self = this;
    if (self.serverSocket) {
        return self.serverSocket.address() || null;
    } else if (self.topChannel) {
        return self.topChannel.address();
    } else {
        return null;
    }
};

/*
    Build a new opts
    Copy all props from defaults over.
    Build a new opts.headers
    Copy all headers from defaults.headers over
    For each key in per request options; assign
    For each key in per request headers; assign
*/
TChannel.prototype.requestOptions = function requestOptions(options) {
    var self = this;
    var prop;
    var opts = {};
    // jshint forin:false
    for (prop in self.requestDefaults) {
        if (prop === 'headers') {
            continue;
        }

        opts[prop] = self.requestDefaults[prop];
    }
    opts.headers = {};
    if (self.requestDefaults.headers) {
        for (prop in self.requestDefaults.headers) {
            opts.headers[prop] = self.requestDefaults.headers[prop];
        }
    }

    if (options) {
        for (prop in options) {
            if (prop === 'headers') {
                continue;
            }
            opts[prop] = options[prop];
        }
    }
    if (options && options.headers) {
        opts.headers = opts.headers;
        for (prop in options.headers) {
            opts.headers[prop] = options.headers[prop];
        }
    }
    // jshint forin:true
    return opts;
};

TChannel.prototype.waitForIdentified =
function waitForIdentified(options, callback) {
    var self = this;
    if (self.destroyed) {
        callback(errors.TChannelDestroyedError());
    } else {
        assert(typeof options.host === 'string', 'options.host is required');
        var peer = self.peers.add(options.host);
        peer.waitForIdentified(callback);
    }
};

/*
    Build a new opts
    Copy all props from defaults over.
    Build a new opts.headers
    Copy all headers from defaults.headers over
    For each key in per request options; assign
    For each key in per request headers; assign
*/
TChannel.prototype.fastRequestDefaults =
function fastRequestDefaults(reqOpts) {
    var self = this;

    var defaults = self.requestDefaults;
    if (!defaults) {
        return;
    }

    if (defaults.timeout && !reqOpts.timeout) {
        reqOpts.timeout = defaults.timeout;
    }
    if (defaults.retryLimit && !reqOpts.retryLimit) {
        reqOpts.retryLimit = defaults.retryLimit;
    }
    if (defaults.serviceName && !reqOpts.serviceName) {
        reqOpts.serviceName = defaults.serviceName;
    }
    if (defaults._trackPendingSpecified && !reqOpts._trackPendingSpecified) {
        reqOpts.trackPending = defaults.trackPending;
    }
    if (defaults._checkSumTypeSpecified && reqOpts.checksumType === null) {
        reqOpts.checksumType = defaults.checksumType;
    }
    if (defaults._hasNoParentSpecified && !reqOpts._hasNoParentSpecified) {
        reqOpts.hasNoParent = defaults.hasNoParent;
    }
    if (defaults._traceSpecified && !reqOpts._traceSpecified) {
        reqOpts.trace = defaults.trace;
    }
    if (defaults.retryFlags && !reqOpts._retryFlagsSpecified) {
        reqOpts.retryFlags = defaults.retryFlags;
    }
    if (defaults.shouldApplicationRetry &&
        !reqOpts.shouldApplicationRetry
    ) {
        reqOpts.shouldApplicationRetry = defaults.shouldApplicationRetry;
    }

    if (defaults.headers) {
        // jshint forin:false
        for (var key in defaults.headers) {
            if (!reqOpts.headers[key]) {
                reqOpts.headers[key] = defaults.headers[key];
            }
        }
        // jshint forin:true
    }
};

function RequestDefaults(reqDefaults) {
    var self = this;

    self.timeout = reqDefaults.timeout || 0;
    self.retryLimit = reqDefaults.retryLimit || 0;
    self.serviceName = reqDefaults.serviceName || '';

    self._trackPendingSpecified = typeof reqDefaults.trackPending === 'boolean';
    self.trackPending = reqDefaults.trackPending;

    self._checkSumTypeSpecified = typeof reqDefaults.checksumType === 'number';
    self.checksumType = reqDefaults.checksumType || 0;

    self._hasNoParentSpecified = typeof reqDefaults.hasNoParent === 'boolean';
    self.hasNoParent = reqDefaults.hasNoParent || false;

    self._traceSpecified = typeof reqDefaults.trace === 'boolean';
    self.trace = reqDefaults.trace || false;

    self.retryFlags = reqDefaults.retryFlags || null;
    self.shouldApplicationRetry = reqDefaults.shouldApplicationRetry || null;

    self.headers = reqDefaults.headers;
}

TChannel.prototype.request = function channelRequest(options) {
    var self = this;

    options = options || {};

    var opts = new RequestOptions(self, options);
    self.fastRequestDefaults(opts);

    if (opts.trace && opts.hasNoParent) {
        if (Math.random() < self.traceSample) {
            opts.trace = true;
        } else {
            opts.trace = false;
        }
    }

    return self._request(opts);
};

function RequestOptions(channel, opts) {
    /*eslint complexity: [2, 30]*/
    var self = this;

    self.channel = channel;

    self.host = opts.host || '';
    self.streamed = opts.streamed || false;
    self.timeout = opts.timeout || 0;
    self.retryLimit = opts.retryLimit || 0;
    self.serviceName = opts.serviceName || '';
    self._trackPendingSpecified = typeof opts.trackPending === 'boolean';
    self.trackPending = opts.trackPending || false;
    self.checksumType = opts.checksumType || null;
    self._hasNoParentSpecified = typeof opts.hasNoParent === 'boolean';
    self.hasNoParent = opts.hasNoParent || false;
    self.forwardTrace = opts.forwardTrace || false;
    self._traceSpecified = typeof opts.trace === 'boolean';
    self.trace = self._traceSpecified ? opts.trace : true;
    self._retryFlagsSpecified = !!opts.retryFlags;
    self.retryFlags = opts.retryFlags || DEFAULT_RETRY_FLAGS;
    self.shouldApplicationRetry = opts.shouldApplicationRetry || null;
    self.parent = opts.parent || null;
    self.tracing = opts.tracing || null;
    self.peer = opts.peer || null;
    self.timeoutPerAttempt = opts.timeoutPerAttempt || 0;
    self.checksum = opts.checksum || null;

    // TODO optimize?
    self.headers = opts.headers || new RequestHeaders();

    self.retryCount = 0;
    self.logical = false;
    self.remoteAddr = null;
    self.hostPort = null;
}

function RequestHeaders() {
    var self = this;

    self.cn = '';
    self.as = '';
    self.re = '';
}

TChannel.prototype._request = function _request(opts) {
    /*eslint max-statements: [2, 25]*/
    var self = this;

    assert(!self.destroyed, 'cannot request() to destroyed tchannel');
    if (!self.topChannel) {
        throw errors.TopLevelRequestError();
    }

    var req = null;
    // retries are only between hosts
    if (opts.peer) {
        opts.retryCount = 0;
        req = opts.peer.request(opts);
    } else if (opts.host) {
        opts.retryCount = 0;
        opts.peer = self.peers.add(opts.host);
        req = opts.peer.request(opts);
    // streaming retries not yet implemented
    } else if (opts.streamed) {
        opts.retryCount = 0;

        opts.peer = self.peers.choosePeer();
        if (!opts.peer) {
            // TODO: operational error?
            throw errors.NoPeerAvailable();
        }
        req = opts.peer.request(opts);
    } else {
        req = new TChannelRequest(opts);
    }

    return req;
};

TChannel.prototype.quit = // to provide backward compatibility.
TChannel.prototype.close = function close(callback) {
    var self = this;
    assert(!self.destroyed, 'TChannel double close');
    self.destroyed = true;

    var counter = 1;

    if (self.sanityTimer) {
        self.timers.clearTimeout(self.sanityTimer);
        self.sanityTimer = null;
    }

    if (self.serverSocket) {
        ++counter;
        if (self.serverSocket.address()) {
            closeServerSocket();
        } else {
            self.serverSocket.once('listening', closeServerSocket);
        }
    }

    if (self.serverConnections) {
        var incomingConns = Object.keys(self.serverConnections);
        for (var i = 0; i < incomingConns.length; i++) {
            ++counter;
            var incomingConn = self.serverConnections[incomingConns[i]];
            incomingConn.close(onClose);
        }
    }

    if (self.subChannels) {
        var serviceNames = Object.keys(self.subChannels);
        serviceNames.forEach(function each(serviceName) {
            var svcchan = self.subChannels[serviceName];
            if (!svcchan.destroyed) {
                counter++;
                svcchan.close(onClose);
            }
        });
    }

    if (!self.topChannel) {
        self.flushStats();
        self.timeHeap.clear();
        self.timers.clearTimeout(self.batchStatTimer);
    }

    self.peers.close(onClose);

    function closeServerSocket() {
        self.serverSocket.once('close', onClose);
        self.serverSocket.close();
    }

    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more channel sockets than expected', {
                    counter: counter
                });
            }
            if (typeof callback === 'function') {
                callback();
            }
        }
    }
};

TChannel.prototype.buildStat =
function buildStat(name, type, value, tags) {
    var self = this;

    tags.app = self.statTags.app;
    tags.host = self.statTags.host;
    tags.cluster = self.statTags.cluster;
    tags.version = self.statTags.version;

    return new BaseStat(
        name, type, value, tags
    );
};

TChannel.prototype.emitFastStat = function emitFastStat(stat) {
    var self = this;

    if (self.topChannel) {
        self.topChannel.emitFastStat(stat);
    } else {
        self.statsQueue.push(stat);
    }
};

TChannel.prototype.emitStat = function emitStat(stat) {
    var self = this;

    var commonTags = self.statTags;
    var commonKeys = Object.keys(self.statTags);

    var localTags = stat.tags;
    for (var i = 0; i < commonKeys.length; i++) {
        localTags[commonKeys[i]] = commonTags[commonKeys[i]];
    }

    if (self.topChannel) {
        self.topChannel.emitFastStat(stat);
    } else {
        self.statsQueue.push(stat);
    }
};

TChannel.prototype.sanitySweep = function sanitySweep() {
    var self = this;

    if (self.serverConnections) {
        var incomingConns = Object.keys(self.serverConnections);
        for (var i = 0; i < incomingConns.length; i++) {
            var conn = self.serverConnections[incomingConns[i]];
            conn.ops.sanitySweep();
        }
    }

    self.peers.sanitySweep();
};

module.exports = TChannel;
