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

var TChannelAsThrift = require('./as/thrift');
var TChannelAsJSON = require('./as/json');
var TChannelConnection = require('./connection');
var TChannelPeers = require('./peers');
var TChannelServices = require('./services');
var TChannelStatsd = require('./lib/statsd');

var TracingAgent = require('./trace/agent');

var CONN_STALE_PERIOD = 1500;

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
    self.requestEvent = self.defineEvent('request');

    self.outboundCallsSentStat = self.defineCounter('outbound.calls.sent');
    self.outboundCallsSuccessStat = self.defineCounter('outbound.calls.success');
    self.outboundCallsSystemErrorsStat = self.defineCounter('outbound.calls.system-errors');
    self.outboundCallsOperationalErrorsStat = self.defineCounter('outbound.calls.operational-errors');
    self.outboundCallsAppErrorsStat = self.defineCounter('outbound.calls.app-errors');
    self.outboundCallsRetriesStat = self.defineCounter('outbound.calls.retries');
    // self.outboundRequestSizeStat = self.defineTiming('outbound.request.size');
    // self.outboundResponseSizeStat = self.defineTiming('outbound.response.size');
    self.outboundCallsLatencyStat = self.defineTiming('outbound.calls.latency');
    self.outboundCallsPerAttemptLatencyStat = self.defineTiming('outbound.calls.per-attempt-latency');

    self.inboundCallsRecvdStat = self.defineCounter('inbound.calls.recvd');
    self.inboundCallsSuccessStat = self.defineCounter('inbound.calls.success');
    self.inboundCallsSystemErrorsStat = self.defineCounter('inbound.calls.system-errors');
    self.inboundCallsAppErrorsStat = self.defineCounter('inbound.calls.app-errors');
    // self.inboundCallsCancelsRequestedStat = self.defineCounter('inbound.cancels.requested');
    // self.inboundCallsCancelsHonoredStat = self.defineCounter('inbound.cancels.honored');
    // self.inboundRequestSizeStat = self.defineTiming('inbound.request.size');
    // self.inboundResponseSizeStat = self.defineTiming('inbound.response.size');
    // self.inboundProtocolErrorsStat = self.defineCounter('inbound.protocol-errors');
    self.inboundCallsLatencyStat = self.defineTiming('inbound.calls.latency');

    self.options = extend({
        timeoutCheckInterval: 100,
        timeoutFuzz: 100,
        connectionStalePeriod: CONN_STALE_PERIOD,

        // TODO: maybe we should always add pid to user-supplied?
        processName: format('%s[%s]', process.title, process.pid)
    }, options);

    // required: 'app'
    // optional: 'host', 'cluster', 'version'
    assert(!self.options.statTags || self.options.statTags.app, 'the stats must have the "app" tag');
    self.statTags = self.options.statTags || {};

    self.statsd = self.options.statsd;
    if (self.statsd) {
        self.channelStatsd = new TChannelStatsd(self, self.statsd);
    }

    self.requestDefaults = extend({
        timeout: TChannelRequest.defaultTimeout
    }, self.options.requestDefaults);

    self.logger = self.options.logger || nullLogger;
    self.random = self.options.random || globalRandom;
    self.timers = self.options.timers || globalTimers;
    self.initTimeout = self.options.initTimeout || 2000;

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

    // populated by makeSubChannel
    self.topChannel = null;
    self.subChannels = self.serviceName ? null : {};

    // how to handle incoming requests
    if (!self.options.handler) {
        if (!self.serviceName) {
            self.handler = TChannelServiceNameHandler(self);
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
    self.peers = TChannelPeers(self, self.options);

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

    var trace = typeof self.options.trace === 'boolean' ?
        self.options.trace : true;

    if (trace) {
        self.tracer = new TracingAgent({
            logger: self.logger,
            forceTrace: self.options.forceTrace,
            serviceName: self.options.serviceNameOverwrite,
            reporter: self.options.traceReporter
        });

        if (self.requestDefaults.trace !== false) {
            self.requestDefaults.trace = true;
        }
    }

    // lazily created by .getServer (usually from .listen)
    self.serverSocket = null;
    self.serverConnections = null;

    self.TChannelAsThrift = TChannelAsThrift;
    self.TChannelAsJSON = TChannelAsJSON;
}
inherits(TChannel, StatEmitter);

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

TChannel.prototype.onServerSocketConnection = function onServerSocketConnection(sock) {
    var self = this;

    if (self.destroyed) {
        self.logger.error('got incoming socket whilst destroyed', {
            remoteAddr: sock.remoteAddr,
            remotePort: sock.remotePort,
            hostPort: self.hostPort
        });
        return;
    }

    var remoteAddr = sock.remoteAddress + ':' + sock.remotePort;
    var conn = new TChannelConnection(self, sock, 'in', remoteAddr);

    conn.spanEvent.on(function handleSpanFromConn(span) {
        self.tracer.report(span);
    });

    if (self.serverConnections[remoteAddr]) {
        var oldConn = self.serverConnections[remoteAddr];
        oldConn.resetAll(errors.SocketClosedError({
            reason: 'duplicate remoteAddr incoming conn'
        }));
        delete self.serverConnections[remoteAddr];
    }

    sock.on('close', onSocketClose);

    self.serverConnections[remoteAddr] = conn;
    self.connectionEvent.emit(self, conn);

    function onSocketClose() {
        delete self.serverConnections[remoteAddr];
    }
};

TChannel.prototype.onServerSocketListening = function onServerSocketListening() {
    var self = this;

    if (self.destroyed) {
        self.logger.error('got serverSocket listen whilst destroyed', {
            requestHostPort: self.host + ':' + self.requestedPort,
            hostPort: self.host + ':' + self.serverSocket.address().port
        });
        return;
    }

    var address = self.serverSocket.address();
    self.hostPort = self.host + ':' + address.port;
    self.listening = true;

    if (self.subChannels) {
        Object.keys(self.subChannels).forEach(function each(serviceName) {
            var chan = self.subChannels[serviceName];
            if (!chan.hostPort) {
                chan.hostPort = self.hostPort;
            }
        });
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
        err: err,
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
    var chan = TChannel(opts);
    chan.topChannel = self;
    if (options.peers) {
        for (i = 0; i < options.peers.length; i++) {
            if (typeof options.peers[i] === 'string') {
                chan.peers.addPeer(self.peers.add(options.peers[i]));
            } else {
                chan.peers.addPeer(options.peers[i]);
            }
        }
    }
    self.subChannels[chan.serviceName] = chan;

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
            throw errors.InvalidHandlerForRegister({
                handlerType: handlerType,
                handler: self.handler
            });
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

    self.peers.waitForIdentified(options, callback);
};

TChannel.prototype.request = function channelRequest(options) {
    var self = this;
    assert(!self.destroyed, 'cannot request() to destroyed tchannel');
    var opts = self.requestOptions(options);

    if (!self.topChannel) {
        throw errors.TopLevelRequestError();
    }

    var req = null;
    if (opts.host || // retries are only between hosts
        opts.streamed // streaming retries not yet implemented
    ) {
        opts.retryCount = 0;
        req = self.peers.request(null, opts);
    } else {
        req = new TChannelRequest(self, opts);
    }
    self.requestEvent.emit(self, req);
    return req;
};

TChannel.prototype.quit = // to provide backward compatibility.
TChannel.prototype.close = function close(callback) {
    var self = this;
    assert(!self.destroyed, 'TChannel double close');
    self.destroyed = true;

    var counter = 1;

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

TChannel.prototype.emitStat = function emitStat(stat) {
    var self = this;

    var commonTags = self.statTags;
    var commonKeys = Object.keys(self.statTags);

    var localTags = stat.tags;
    for (var i = 0; i < commonKeys.length; i++) {
        localTags[commonKeys[i]] = commonTags[commonKeys[i]];
    }

    self.statEvent.emit(self, stat);

    if (self.topChannel) {
        self.topChannel.statEvent.emit(self, stat);
    }
};

module.exports = TChannel;
