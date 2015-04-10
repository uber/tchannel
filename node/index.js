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

var globalTimers = {
    setTimeout: require('timers').setTimeout,
    clearTimeout: require('timers').clearTimeout,
    now: Date.now
};
var globalRandom = Math.random;
var net = require('net');
var format = require('util').format;
var extend = require('xtend');
var bufrw = require('bufrw');
var ReadMachine = require('bufrw/stream/read_machine');
var reqres = require('./reqres');

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var v2 = require('./v2');
var nullLogger = require('./null-logger.js');
// var Spy = require('./v2/spy'); TODO
var EndpointHandler = require('./endpoint-handler.js');
var TChannelServiceNameHandler = require('./service-name-handler');
var errors = require('./errors');

var DEFAULT_OUTGOING_REQ_TIMEOUT = 2000;
// var dumpEnabled = /\btchannel_dump\b/.test(process.env.NODE_DEBUG || ''); TODO

function TChannel(options) {
    if (!(this instanceof TChannel)) {
        return new TChannel(options);
    }

    var self = this;
    EventEmitter.call(self);

    self.options = extend({
        reqTimeoutDefault: 5000,
        serverTimeoutDefault: 5000,
        timeoutCheckInterval: 1000,
        timeoutFuzz: 100,
        // TODO: maybe we should always add pid to user-supplied?
        processName: format('%s[%s]', process.title, process.pid)
    }, options);

    self.logger = self.options.logger || nullLogger;
    self.random = self.options.random || globalRandom;
    self.timers = self.options.timers || globalTimers;

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

    // TChannel advances through the following states.
    self.listened = false;
    self.listening = false;
    self.destroyed = false;

    if (self.options.trace) {
        self.tracer = require('./trace/agent');
    }

    // lazily created by .getServer (usually from .listen)
    self.serverSocket = null;
    self.serverConnections = null;
}
inherits(TChannel, EventEmitter);

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

    conn.on('span', function handleSpanFromConn(span) {
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
    self.emit('connection', conn);

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

    self.emit('listening');
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
    self.emit('error', err);
};

TChannel.prototype.makeSubChannel = function makeSubChannel(options) {
    var self = this;
    if (!options) options = {};
    if (self.serviceName) {
        throw new Error('arbitrary-depth sub channels are unsupported'); // TODO typed error
    }
    if (!options.serviceName) {
        throw new Error('must specify serviceName'); // TODO typed error
    }
    if (self.subChannels[options.serviceName]) {
        throw new Error('sub channel already exists'); // TODO typed error
    }
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

// Decoulping config and creation from the constructor.
TChannel.prototype.listen = function listen(port, host, callback) {
    var self = this;
    if (self.listened) {
        throw new Error('TChannel can only listen once'); // TODO typed error
    }
    if (typeof host !== 'string') {
        throw new Error('TChannel requires host argument'); // TODO typed error
    }
    if (typeof port !== 'number') {
        // Note that 0 is a valid port number, indicating that the system must
        // assign an available ephemeral port.
        throw new Error('TChannel must listen with numeric port'); // TODO typed error
    }
    // Does not expressly forbid 127.0.0.1 or localhost since these are valid
    // hosts for testing.
    if (host === '0.0.0.0') {
        throw new Error('TChannel must listen with externally visible host'); // TODO typed error
    }
    self.listened = true;
    self.requestedPort = port;
    self.host = host;
    self.getServer().listen(port, host, callback);
};

// TODO: deprecated, callers should use .handler directly
TChannel.prototype.register = function register(name, handler) {
    var self = this;

    var handlerType = self.handler && self.handler.type;

    switch (handlerType) {
        case 'tchannel.endpoint-handler':
            // If its still the legacy handler then we are good.
            self.handler.register(name, onReqRes);
            break;

        case 'tchannel.service-name-handler':
            throw errors.TopLevelRegisterError();

        default:
            throw errors.InvalidHandlerForRegister({
                handlerType: handlerType,
                handler: self.handler
            });
    }

    function onReqRes(req, res, arg2, arg3) {
        handler(arg2, arg3, req.remoteAddr, onResponse);

        function onResponse(err, res1, res2) {
            if (err) {
                res.sendNotOk(res1, err.message);
            } else {
                res.sendOk(res1, res2);
            }
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

/* jshint maxparams:5 */
// TODO: deprecated, callers should use .request directly
TChannel.prototype.send = function send(options, arg1, arg2, arg3, callback) {
    var self = this;

    return self
        .request(options)
        .send(arg1, arg2, arg3, onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return callback(err);
        }

        if (!res.ok) {
            return callback(new Error(String(arg3)));
        }

        return callback(null, arg2, arg3);
    }
};
/* jshint maxparams:4 */

TChannel.prototype.request = function channelRequest(options) {
    options = extend(options);
    var self = this;
    if (!options.service && self.serviceName) {
        options.service = self.serviceName;
    }
    // TODO: moar defaults
    if (self.destroyed) {
        throw new Error('cannot request() to destroyed tchannel'); // TODO typed error
    } else {
        return self.peers.request(options);
    }
};

TChannel.prototype.quit = // to provide backward compatibility.
TChannel.prototype.close = function close(callback) {
    var self = this;

    if (self.destroyed) {
        throw new Error('double close'); // TODO typed error
    }

    if (self.tracer) {
        self.tracer.destroy();
    }

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

function TChannelConnectionBase(channel, direction, remoteAddr) {
    var self = this;
    EventEmitter.call(self);
    self.channel = channel;
    self.options = self.channel.options;
    self.logger = self.options.logger || nullLogger;
    self.random = self.options.random || globalRandom;
    self.timers = self.options.timers || globalTimers;
    self.direction = direction;
    self.remoteAddr = remoteAddr;
    self.timer = null;
    self.remoteName = null; // filled in by identify message

    // TODO: factor out an operation collection abstraction
    self.inOps = Object.create(null);
    self.inPending = 0;
    self.outOps = Object.create(null);
    self.outPending = 0;

    self.lastTimeoutTime = 0;
    self.closing = false;

    self.startTimeoutTimer();
    self.tracer = self.channel.tracer;
}
inherits(TChannelConnectionBase, EventEmitter);

TChannelConnectionBase.prototype.close = function close(callback) {
    var self = this;
    self.resetAll(errors.SocketClosedError({reason: 'local close'}));
    callback();
};

// timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
//   base - fuzz/2 to base + fuzz/2
TChannelConnectionBase.prototype.getTimeoutDelay = function getTimeoutDelay() {
    var self = this;
    var base = self.options.timeoutCheckInterval;
    var fuzz = self.options.timeoutFuzz;
    return base + Math.round(Math.floor(self.random() * fuzz) - (fuzz / 2));
};

TChannelConnectionBase.prototype.startTimeoutTimer = function startTimeoutTimer() {
    var self = this;
    self.timer = self.timers.setTimeout(function onChannelTimeout() {
        // TODO: worth it to clear the fired self.timer objcet?
        self.onTimeoutCheck();
    }, self.getTimeoutDelay());
};

TChannelConnectionBase.prototype.clearTimeoutTimer = function clearTimeoutTimer() {
    var self = this;
    if (self.timer) {
        self.timers.clearTimeout(self.timer);
        self.timer = null;
    }
};

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
TChannelConnectionBase.prototype.onTimeoutCheck = function onTimeoutCheck() {
    var self = this;
    if (self.closing) {
        return;
    }
    if (self.lastTimeoutTime) {
        self.emit('timedOut');
    } else {
        self.checkOutOpsForTimeout(self.outOps);
        self.checkInOpsForTimeout(self.inOps);
        self.startTimeoutTimer();
    }
};

TChannelConnectionBase.prototype.checkInOpsForTimeout = function checkInOpsForTimeout(ops) {
    var self = this;
    var opKeys = Object.keys(ops);
    var now = self.timers.now();

    for (var i = 0; i < opKeys.length; i++) {
        var opKey = opKeys[i];
        var op = ops[opKey];

        if (op === undefined) {
            continue;
        }

        var timeout = self.options.serverTimeoutDefault;
        var duration = now - op.start;
        if (duration > timeout) {
            delete ops[opKey];
            self.inPending--;
        }
    }
};

TChannelConnectionBase.prototype.checkOutOpsForTimeout = function checkOutOpsForTimeout(ops) {
    var self = this;
    var opKeys = Object.keys(ops);
    var now = self.timers.now();
    for (var i = 0; i < opKeys.length ; i++) {
        var opKey = opKeys[i];
        var op = ops[opKey];
        if (op.timedOut) {
            delete ops[opKey];
            self.outPending--;
            self.logger.warn('lingering timed-out outgoing operation');
            continue;
        }
        if (op === undefined) {
            // TODO: why not null and empty string too? I mean I guess false
            // and 0 might be a thing, but really why not just !op?
            self.channel.logger
                .warn('unexpected undefined operation', {
                    key: opKey,
                    op: op
                });
            continue;
        }
        var timeout = op.req.ttl || self.options.reqTimeoutDefault;
        var duration = now - op.start;
        if (duration > timeout) {
            delete ops[opKey];
            self.outPending--;
            self.onReqTimeout(op);
        }
    }
};

TChannelConnectionBase.prototype.onReqTimeout = function onReqTimeout(op) {
    var self = this;
    op.timedOut = true;
    op.req.emit('error', new Error('timed out')); // TODO typed error
    // TODO: why don't we pop the op?
    self.lastTimeoutTime = self.timers.now();
};

// this connection is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state in case anybody
// stumbles across this object in a core dump.
TChannelConnectionBase.prototype.resetAll = function resetAll(err) {
    var self = this;

    self.clearTimeoutTimer();

    if (self.closing) return;
    self.closing = true;

    var inOpKeys = Object.keys(self.inOps);
    var outOpKeys = Object.keys(self.outOps);

    if (!err) {
        err = new Error('unknown connection reset'); // TODO typed error
    }

    var isError = err.type !== 'tchannel.socket-closed';
    self.logger[isError ? 'warn' : 'info']('resetting connection', {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: self.inPending,
        outPending: self.outPending
    });

    if (isError) {
        self.emit('error', err);
    }

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        // TODO: we could support an op.cancel opt-in callback
        delete self.inOps[id];
        // TODO report or handle or log errors or something
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var op = self.outOps[id];
        delete self.outOps[id];
        // TODO: shared mutable object... use Object.create(err)?
        op.req.emit('error', err);
    });

    self.inPending = 0;
    self.outPending = 0;
};

TChannelConnectionBase.prototype.popOutOp = function popOutOp(id) {
    var self = this;
    var op = self.outOps[id];
    if (!op) {
        // TODO else case. We should warn about an incoming response for an
        // operation we did not send out.  This could be because of a timeout
        // or could be because of a confused / corrupted server.
        return;
    }
    delete self.outOps[id];
    self.outPending--;
    return op;
};

// create a request
TChannelConnectionBase.prototype.request = function connBaseRequest(options) {
    var self = this;
    if (!options) options = {};

    // TODO: use this to protect against >4Mi outstanding messages edge case
    // (e.g. zombie operation bug, incredible throughput, or simply very long
    // timeout
    // if (self.outOps[id]) {
    //  throw new Error('duplicate frame id in flight'); // TODO typed error
    // }
    // TODO: provide some sort of channel default for "service"
    // TODO: generate tracing if empty?
    // TODO: refactor callers
    options.checksumType = options.checksum;

    // TODO: better default, support for dynamic
    options.ttl = options.timeout || DEFAULT_OUTGOING_REQ_TIMEOUT;
    options.tracer = self.tracer;
    var req = self.buildOutgoingRequest(options);
    var id = req.id;
    self.outOps[id] = new TChannelClientOp(req, self.timers.now());
    self.pendingCount++;
    return req;
};

TChannelConnectionBase.prototype.handleCallRequest = function handleCallRequest(req) {
    var self = this;
    req.remoteAddr = self.remoteName;
    var id = req.id;
    self.inPending++;
    var op = self.inOps[id] = new TChannelServerOp(self, self.timers.now(), req);
    var done = false;
    process.nextTick(runHandler);

    if (req.span) {
        req.span.endpoint.serviceName = self.channel.serviceName;
    }

    function runHandler() {
        self.channel.handler.handleRequest(req, buildResponse);
    }

    function handleSpanFromRes(span) {
        self.emit('span', span);
    }

    function buildResponse(options) {
        if (op.res && op.res.state !== reqres.States.Initial) {
            throw new Error('response already built and started'); // TODO: typed error
        }
        op.res = self.buildOutgoingResponse(req, options);
        op.res.on('finish', opDone);
        op.res.on('span', handleSpanFromRes);
        return op.res;
    }

    function opDone() {
        if (done) return;
        done = true;
        if (self.inOps[id] !== op) {
            self.logger.warn('mismatched opDone callback', {
                hostPort: self.channel.hostPort,
                opId: id
            });
            return;
        }
        delete self.inOps[id];
        self.inPending--;
    }
};

function TChannelConnection(channel, socket, direction, remoteAddr) {
    if (remoteAddr === channel.hostPort) {
        throw new Error('refusing to create self connection'); // TODO typed error
    }

    var self = this;
    TChannelConnectionBase.call(self, channel, direction, remoteAddr);
    self.socket = socket;
    self.handler = new v2.Handler(extend({
        hostPort: self.channel.hostPort,
        tracer: self.tracer
    }, self.options));
    self.mach = ReadMachine(bufrw.UInt16BE, v2.Frame.RW);

    self.setupSocket();
    self.setupHandler();
    self.start();
}
inherits(TChannelConnection, TChannelConnectionBase);

TChannelConnection.prototype.setupSocket = function setupSocket() {
    var self = this;

    self.socket.setNoDelay(true);
    self.socket.on('data', onSocketChunk);
    self.socket.on('close', onSocketClose);
    self.socket.on('error', onSocketError);

    function onSocketChunk(chunk) {
        self.mach.handleChunk(chunk, chunkHandled);
    }

    function chunkHandled(err) {
        if (err) {
            self.resetAll(errors.TChannelReadProtocolError(err, {
                remoteName: self.remoteName,
                localName: self.channel.hostPort
            }));
            self.socket.destroy();
        }
    }

    function onSocketClose() {
        self.resetAll(errors.SocketClosedError({reason: 'remote clossed'}));
        if (self.remoteName === '0.0.0.0:0') {
            self.channel.peers.delete(self.remoteAddr);
        }
    }

    function onSocketError(err) {
        self.onSocketErr(err);
    }
};

TChannelConnection.prototype.setupHandler = function setupHandler() {
    var self = this;

    self.handler.write = function write(buf, done) {
        self.socket.write(buf, null, done);
    };

    self.mach.emit = handleReadFrame;

    self.handler.on('write.error', onWriteError);
    self.handler.on('error', onHandlerError);
    self.handler.on('call.incoming.request', onCallRequest);
    self.handler.on('call.incoming.response', onCallResponse);
    self.handler.on('call.incoming.error', onCallError);
    self.on('timedOut', onTimedOut);

    // TODO: restore dumping from old:
    // var stream = self.socket;
    // if (dumpEnabled) {
    //     stream = stream.pipe(Spy(process.stdout, {
    //         prefix: '>>> ' + self.remoteAddr + ' '
    //     }));
    // }
    // stream = stream
    //     .pipe(self.reader)
    //     .pipe(self.handler)
    //     ;
    // if (dumpEnabled) {
    //     stream = stream.pipe(Spy(process.stdout, {
    //         prefix: '<<< ' + self.remoteAddr + ' '
    //     }));
    // }
    // stream = stream
    //     .pipe(self.socket)
    //     ;

    function onWriteError(err) {
        self.resetAll(errors.TChannelWriteProtocolError(err, {
            remoteName: self.remoteName,
            localName: self.channel.hostPort
        }));
        self.socket.destroy();
    }

    function onHandlerError(err) {
        self.resetAll(err);
        // resetAll() does not close the socket
        self.socket.destroy();
    }

    function handleReadFrame(frame) {
        if (!self.closing) {
            self.lastTimeoutTime = 0;
        }
        self.handler.handleFrame(frame, handledFrame);
    }

    function handledFrame(err) {
        if (err) {
            onHandlerError(err);
        }
    }

    function onCallRequest(req) {
        self.handleCallRequest(req);
    }

    function onCallResponse(res) {
        var op = self.popOutOp(res.id);
        if (!op) {
            self.logger.info('response received for unknown or lost operation', {
                responseId: res.id,
                remoteAddr: self.remoteAddr,
                direction: self.direction,
            });
            return;
        }

        if (self.tracer) {
            // TODO: better annotations
            op.req.span.annotate('cr');
            self.tracer.report(op.req.span);
        }

        op.req.emit('response', res);
    }

    function onCallError(err) {
        var op = self.popOutOp(err.originalId); // TODO bork bork
        if (!op) {
            self.logger.info('error received for unknown or lost operation', err);
            return;
        }
        op.req.emit('error', err);
        // TODO: should terminate corresponding inc res
    }

    function onTimedOut() {
        self.logger.warn(self.channel.hostPort + ' destroying socket from timeouts');
        self.socket.destroy();
    }
};

TChannelConnection.prototype.start = function start() {
    var self = this;
    if (self.direction === 'out') {
        self.handler.sendInitRequest();
        self.handler.once('init.response', onOutIdentified);
    } else {
        self.handler.once('init.request', onInIdentified);
    }

    function onOutIdentified(init) {
        self.remoteName = init.hostPort;
        self.emit('identified', {
            hostPort: init.hostPort,
            processName: init.processName
        });
    }

    function onInIdentified(init) {
        if (init.hostPort === '0.0.0.0:0') {
            self.remoteName = '' + self.socket.remoteAddress + ':' + self.socket.remotePort;
            if (self.remoteName === self.channel.hostPort) {
                throw new Error('EPHEMERAL SELF?');
            }
        } else {
            self.remoteName = init.hostPort;
        }
        self.channel.peers.add(self.remoteName).addConnection(self);
        self.emit('identified', {
            hostPort: self.remoteName,
            processName: init.processName
        });
    }
};

TChannelConnection.prototype.close = function close(callback) {
    var self = this;
    if (self.socket.destroyed) {
        callback();
    } else {
        self.socket.once('close', callback);
        self.resetAll(errors.SocketClosedError({reason: 'local close'}));
        self.socket.destroy();
    }
};

TChannelConnection.prototype.onSocketErr = function onSocketErr(err) {
    var self = this;
    if (!self.closing) {
        self.resetAll(err);
    }
};

TChannelConnection.prototype.buildOutgoingRequest = function buildOutgoingRequest(options) {
    var self = this;
    return self.handler.buildOutgoingRequest(options);
};

TChannelConnection.prototype.buildOutgoingResponse = function buildOutgoingResponse(req, options) {
    var self = this;
    return self.handler.buildOutgoingResponse(req, options);
};

function TChannelServerOp(connection, start, req, res) {
    var self = this;
    self.req = req;
    self.res = res || null;
    self.connection = connection;
    self.logger = connection.logger;
    self.timedOut = false;
    self.start = start;
}

function TChannelClientOp(req, start) {
    var self = this;
    self.req = req;
    self.start = start;
    self.timedOut = false;
}

function TChannelPeers(channel, options) {
    if (!(this instanceof TChannelPeers)) {
        return new TChannelPeers(channel, options);
    }
    var self = this;
    EventEmitter.call(self);
    self.channel = channel;
    self.logger = self.channel.logger;
    self.options = options || {};
    self._map = Object.create(null);
    self.selfPeer = TChannelSelfPeer(self.channel);
}

inherits(TChannelPeers, EventEmitter);

TChannelPeers.prototype.close = function close(callback) {
    var self = this;
    var peers = [self.selfPeer].concat(self.values());
    var counter = peers.length;
    peers.forEach(function eachPeer(peer) {
        peer.close(onClose);
    });
    self.clear();

    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more peers than expected', {
                    counter: counter
                });
            }
            callback();
        }
    }
};

TChannelPeers.prototype.get = function get(hostPort) {
    var self = this;
    return self._map[hostPort] || null;
};

TChannelPeers.prototype.add = function add(hostPort, options) {
    var self = this;
    var peer = self._map[hostPort];
    if (!peer) {
        if (hostPort === self.channel.hostPort) {
            return self.selfPeer;
        }
        if (self.channel.topChannel) {
            peer = self.channel.topChannel.peers.add(hostPort);
        } else {
            peer = TChannelPeer(self.channel, hostPort, options);
            self.emit('allocPeer', peer);
        }
        self._map[hostPort] = peer;
    }
    return peer;
};

TChannelPeers.prototype.addPeer = function addPeer(peer) {
    var self = this;
    if (!peer instanceof TChannelPeer) {
        throw new Error('invalid peer'); // TODO typed error
    }
    if (self._map[peer.hostPort]) {
        throw new Error('peer already defined'); // TODO typed error
    }
    if (peer.hostPort !== self.channel.hostPort) {
        self._map[peer.hostPort] = peer;
    }
};

TChannelPeers.prototype.keys = function keys() {
    var self = this;
    return Object.keys(self._map);
};

TChannelPeers.prototype.values = function values() {
    var self = this;
    var keys = Object.keys(self._map);
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = self._map[keys[i]];
    }
    return ret;
};

TChannelPeers.prototype.entries = function entries() {
    var self = this;
    var keys = Object.keys(self._map);
    var ret = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        ret[i] = [keys[i], self._map[keys[i]]];
    }
    return ret;
};

TChannelPeers.prototype.clear = function clear() {
    var self = this;
    var keys = self.keys();
    var vals = new Array(keys.length);
    for (var i = 0; i < keys.length; i++) {
        vals[i] = self._map[keys[i]];
        delete self._map[keys[i]];
    }
    return vals;
};

TChannelPeers.prototype.delete = function del(hostPort) {
    var self = this;
    var peer = self._map[hostPort];
    delete self._map[hostPort];
    if (self.subChannels) {
        var names = Object.keys(self.subChannels);
        for (var i = 0; i < names.length; i++) {
            self.subChannels[names[i]].delete(hostPort);
        }
    }
    return peer;
};

TChannelPeers.prototype.request = function peersRequest(options) {
    var self = this;
    var peer = self.choosePeer(options, null);

    if (!peer) {
        // TODO: operational error?
        throw new Error('no peer available for request'); // TODO: typed error
    }

    return peer.request(options);
};

TChannelPeers.prototype.choosePeer = function choosePeer(options, op) {
    var self = this;

    if (!options) options = {};
    var hosts = null;
    if (options.host) {
        return self.add(options.host);
    } else {
        hosts = Object.keys(self._map);
    }
    if (!hosts || !hosts.length) return null;

    var threshold = options.peerScoreThreshold;
    if (threshold === undefined) threshold = self.options.peerScoreThreshold;
    if (threshold === undefined) threshold = 0;

    var selectedPeer = null, selectedScore = 0;
    for (var i = 0; i < hosts.length; i++) {
        var peer = self.add(hosts[i]);
        var score = peer.state.shouldRequest(op, options);
        var want = score > threshold &&
                   (selectedPeer === null || score > selectedScore);
        if (want) {
            selectedPeer = peer;
            selectedScore = score;
        }
    }
    return selectedPeer;
};


function TChannelPeer(channel, hostPort, options) {
    if (!(this instanceof TChannelPeer)) {
        return new TChannelPeer(channel, hostPort, options);
    }
    var self = this;
    EventEmitter.call(self);
    self.channel = channel;
    self.logger = self.channel.logger;
    self.options = options || {};
    self.hostPort = hostPort;
    self.isEphemeral = self.hostPort === '0.0.0.0:0';
    self.state = null; // TODO
    self.connections = [];
    if (self.options.initialState) {
        self.setState(self.options.initialState);
        delete self.options.initialState;
    } else {
        self.setState(TChannelPeerHealthyState);
    }
}

inherits(TChannelPeer, EventEmitter);

TChannelPeer.prototype.isConnected = function isConnected(direction, identified) {
    var self = this;
    if (identified === undefined) identified = true;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (direction && conn.direction !== direction) {
            continue;
        } else if (conn.closing) {
            continue;
        } else if (conn.remoteName !== null || !identified) {
            return true;
        }
    }
    return false;
};

TChannelPeer.prototype.close = function close(callback) {
    var self = this;
    var counter = self.connections.length;
    if (counter) {
        self.connections.forEach(function eachConn(conn) {
            conn.close(onClose);
        });
    } else {
        self.state.close(callback);
    }
    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more peer sockets than expected', {
                    counter: counter
                });
            }
            self.state.close(callback);
        }
    }
};

TChannelPeer.prototype.setState = function setState(StateType) {
    var self = this;
    var currentName = self.state && self.state.name;
    if (currentName &&
        StateType.prototype.name &&
        StateType.prototype.name === currentName) {
        return;
    }
    var state = StateType(self.channel, self);
    if (state && state.name === currentName) {
        return;
    }
    var oldState = self.state;
    self.state = state;
    self.emit('stateChanged', oldState, state);
};

TChannelPeer.prototype.getInConnection = function getInConnection() {
    var self = this;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (!conn.closing) return conn;
    }
    return null;
};

TChannelPeer.prototype.getOutConnection = function getOutConnection() {
    var self = this;
    for (var i = self.connections.length - 1; i >= 0; i--) {
        var conn = self.connections[i];
        if (!conn.closing) return conn;
    }
    return null;
};

TChannelPeer.prototype.connect = function connect(outOnly) {
    var self = this;
    var conn = self.getOutConnection();
    if (!conn || (outOnly && conn.direction !== 'out')) {
        var socket = self.makeOutSocket();
        conn = self.makeOutConnection(socket);
        self.addConnection(conn);
    }
    return conn;
};

TChannelPeer.prototype.request = function peerRequest(options) {
    var self = this;
    var connection = self.connect();
    options.host = options.host || connection.remoteAddr;
    return connection.request(options);
};

TChannelPeer.prototype.addConnection = function addConnection(conn) {
    var self = this;
    // TODO: first approx alert for self.connections.length > 2
    // TODO: second approx support pruning
    if (conn.direction === 'out') {
        self.connections.push(conn);
    } else {
        self.connections.unshift(conn);
    }
    conn.once('error', onConnectionError);
    return conn;

    function onConnectionError(/* err */) {
        // TODO: log?
        self.removeConnection(conn);
    }
};

TChannelPeer.prototype.removeConnection = function removeConnection(conn) {
    var self = this;
    var list = self.connections;
    var index = list ? list.indexOf(conn) : -1;
    if (index !== -1) {
        return list.splice(index, 1)[0];
    } else {
        return null;
    }
};

TChannelPeer.prototype.makeOutSocket = function makeOutSocket() {
    var self = this;
    var parts = self.hostPort.split(':');
    if (parts.length !== 2) {
        throw new Error('invalid destination'); // TODO typed error
    }
    var host = parts[0];
    var port = parts[1];
    if (host === '0.0.0.0' || port === '0') {
        throw new Error('cannot make out connection to ephemeral peer'); // TODO typed error
    }
    var socket = net.createConnection({host: host, port: port});
    return socket;
};

TChannelPeer.prototype.makeOutConnection = function makeOutConnection(socket) {
    var self = this;
    var chan = self.channel.topChannel || self.channel;
    var conn = new TChannelConnection(chan, socket, 'out', self.hostPort);
    self.emit('allocConnection', conn);
    return conn;
};

function TChannelSelfConnection(channel) {
    if (!(this instanceof TChannelSelfConnection)) {
        return new TChannelSelfConnection(channel);
    }
    var self = this;
    TChannelConnectionBase.call(self, channel, 'in', channel.hostPort);
    self.idCount = 0;
}
inherits(TChannelSelfConnection, TChannelConnectionBase);

TChannelSelfConnection.prototype.buildOutgoingRequest = function buildOutgoingRequest(options) {
    var self = this;
    var id = self.idCount++;
    if (!options) options = {};
    options.sendFrame = {
        callRequest: passParts,
        callRequestCont: passParts
    };
    options.tracer = self.tracer;
    var outreq = new reqres.OutgoingRequest(id, options);

    if (outreq.span) {
        options.tracing = outreq.span.getTracing();
    }
    options.hostPort = self.channel.hostPort;

    var inreq = new reqres.IncomingRequest(id, options);
    var called = false;
    inreq.on('error', onError);
    inreq.on('response', onResponse);
    self.handleCallRequest(inreq);
    return outreq;

    function onError(err) {
        if (called) return;
        called = true;
        self.popOutOp(id);
        inreq.removeListener('response', onResponse);
        outreq.emit('error', err);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        self.popOutOp(id);
        inreq.removeListener('error', onError);
        outreq.emit('response', res);
    }

    function passParts(args, isLast ) {
        inreq.handleFrame(args);
        if (isLast) inreq.handleFrame(null);
        if (!self.closing) self.lastTimeoutTime = 0;
    }
};

TChannelSelfConnection.prototype.buildOutgoingResponse = function buildOutgoingResponse(req, options) {
    var self = this;
    if (!options) options = {};
    options.tracing = req.tracing;

    // options.checksum = new v2.Checksum(None);

    options.sendFrame = {
        callResponse: passParts,
        callResponseCont: passParts,
        error: passError
    };
    var outres = new reqres.OutgoingResponse(req.id, options);
    var inres = new reqres.IncomingResponse(req.id, options);
    var first = true;
    return outres;

    function passParts(args, isLast) {
        inres.handleFrame(args);
        if (isLast) inres.handleFrame(null);
        if (first) {
            inres.code = outres.code;
            inres.ok = outres.ok;
            first = false;
            req.emit('response', inres);
        }
        if (!self.closing) self.lastTimeoutTime = 0;
    }

    function passError(codeString, message) {
        var code = v2.ErrorResponse.Codes[codeString];
        var err = v2.ErrorResponse.CodeErrors[code]({
            originalId: req.id,
            message: message
        });
        req.emit('error', err);
        // TODO: should terminate corresponding inc res
        if (!self.closing) self.lastTimeoutTime = 0;
    }
};

function TChannelSelfPeer(channel) {
    if (!(this instanceof TChannelSelfPeer)) {
        return new TChannelSelfPeer(channel);
    }
    var self = this;
    TChannelPeer.call(self, channel, channel.hostPort);
}
inherits(TChannelSelfPeer, TChannelPeer);

TChannelSelfPeer.prototype.connect = function connect() {
    var self = this;
    while (self.connections[0] &&
           self.connections[0].closing) {
        self.connections[0].shift();
    }
    var conn = self.connections[0];
    if (!conn) {
        conn = TChannelSelfConnection(self.channel);
        self.addConnection(conn);
    }
    return conn;
};

TChannelSelfPeer.prototype.makeOutSocket = function makeOutSocket() {
    throw new Error('refusing to make self out socket');
};

TChannelSelfPeer.prototype.makeOutConnection = function makeOutConnection(/* socket */) {
    throw new Error('refusing to make self out connection');
};

function TChannelPeerState(channel, peer) {
    var self = this;
    self.channel = channel;
    self.peer = peer;
}

TChannelPeerState.prototype.close = function close(callback) {
    callback();
};

TChannelPeerState.prototype.shouldRequest = function shouldRequest(/* op, options */) {
    // TODO: op isn't quite right currently as a "TChannelClientOp", the
    // intention is that the other (non-options) arg encapsulates all requests
    // across retries and setries
    return 0;
};

function TChannelPeerHealthyState(channel, peer) {
    if (!(this instanceof TChannelPeerHealthyState)) {
        return new TChannelPeerHealthyState(channel, peer);
    }
    var self = this;
    TChannelPeerState.call(self, channel, peer);
}

inherits(TChannelPeerHealthyState, TChannelPeerState);

TChannelPeerHealthyState.prototype.name = 'healthy';

TChannelPeerHealthyState.prototype.shouldRequest = function shouldRequest(/* op, options */) {
    // return Math.random();
    var self = this;
    return 0.2 + self.channel.random() * 0.8;
};

module.exports = TChannel;
module.exports.PeerState = TChannelPeerState;
