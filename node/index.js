// Copyright (c) 2015 Uber Technologies, Inc.

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
var TypedError = require('error/typed');
var WrappedError = require('error/wrapped');
var extend = require('xtend');
var bufrw = require('bufrw');
var ChunkReader = require('bufrw/stream/chunk_reader');
var ChunkWriter = require('bufrw/stream/chunk_writer');
var reqres = require('./reqres');

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

var v2 = require('./v2');
var nullLogger = require('./null-logger.js');
var Spy = require('./v2/spy');
var EndpointHandler = require('./endpoint-handler.js');

var DEFAULT_OUTGOING_REQ_TIMEOUT = 2000;
var dumpEnabled = /\btchannel_dump\b/.test(process.env.NODE_DEBUG || '');

var TChannelListenError = WrappedError({
    type: 'tchannel.server.listen-failed',
    message: 'tchannel: {origMessage}',
    requestedPort: null,
    host: null
});

var TChannelReadProtocolError = WrappedError({
    type: 'tchannel.protocol.read-failed',
    message: 'tchannel read failure: {origMessage}',
    remoteName: null,
    localName: null
});

var NoHandlerError = TypedError({
    type: 'tchannel.no-handler',
    message: 'no handler defined'
});

var InvalidHandlerForRegister = TypedError({
    type: 'tchannel.invalid-handler.for-registration',
    message: 'Found unexpected handler when calling `.register()`.\n' +
        'You cannot set a custom handler when using `.register()`.\n' +
        '`.register()` is deprecated; use a proper handler.',
    handlerType: null,
    handler: null
});

var noHandlerHandler = {
    type: 'no-handler.handler',
    handleRequest: function noHandlerHandler(req, buildRes) {
        buildRes().sendError('UnexpectedError', NoHandlerError().message);
    }
};

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

    // how to handle incoming requests
    if (!self.options.handler) {
        self.handler = noHandlerHandler;
    } else {
        self.handler = self.options.handler;
        delete self.options.handler;
    }

    // populated by:
    // - manually api (.peers.add etc)
    // - incoming connections on any listening socket
    self.peers = TChannelPeers(self, self.options);
    self._hookupPeers();

    // TChannel advances through the following states.
    self.listened = false;
    self.listening = false;
    self.destroyed = false;

    // lazily created by .getServer (usually from .listen)
    self.serverSocket = null;
}
inherits(TChannel, EventEmitter);

TChannel.prototype.getServer = function getServer() {
    var self = this;
    if (self.serverSocket) return;
    self.serverSocket = net.createServer(function onServerSocketConnection(sock) {
        if (!self.destroyed) {
            var remoteAddr = sock.remoteAddress + ':' + sock.remotePort;
            var conn = new TChannelConnection(self, sock, 'in', remoteAddr);
            self.logger.debug('incoming server connection', {
                hostPort: self.hostPort,
                remoteAddr: conn.remoteAddr
            });
        }
    });
    self.serverSocket.on('listening', function onServerSocketListening() {
        if (!self.destroyed) {
            var address = self.serverSocket.address();
            self.hostPort = self.host + ':' + address.port;
            self.listening = true;
            self.logger.info(self.hostPort + ' listening');
            self.emit('listening');
        }
    });
    self.serverSocket.on('error', function onServerSocketError(err) {
        if (err.code === 'EADDRINUSE') {
            err = TChannelListenError(err, {
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
    });
    self.serverSocket.on('close', function onServerSocketClose() {
        self.logger.warn('server socket close');
    });
    return self.serverSocket;
};

TChannel.prototype._hookupPeers = function _hookupPeers() {
    var self = this;
    self.peers.on('allocPeer', function(peer) {
        self._hookupPeer(peer);
    });
};

TChannel.prototype._hookupPeer = function _hookupPeer(peer) {
    var self = this;

    self.logger.debug('alloc peer', {
        chanHostPort: self.hostPort,
        peerHostPort: peer.hostPort,
        initialState: peer.state.name
    });

    peer.on('stateChanged', function(oldState, newState) {
        self.logger.debug('peer state changed', {
            chanHostPort: self.hostPort,
            peerHostPort: peer.hostPort,
            oldState: oldState.name,
            newState: newState.name
        });
    });

    peer.on('allocConnection', function(conn) {
        self.logger.debug('alloc peer connection', {
            direction: conn.direction,
            chanHostPort: self.hostPort,
            peerHostPort: peer.hostPort
        });
    });
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
        case 'no-handler.handler':
            // lazyily set up the legacy handler
            self.handler = EndpointHandler();

            break;

        case 'tchannel.endpoint-handler':
            // If its still the legacy handler then we are good.
            break;

        default:
            throw InvalidHandlerForRegister({
                handlerType: handlerType,
                handler: self.handler
            });
    }

    self.handler.register(name, onReqRes);

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
    return self.serverSocket && self.serverSocket.address();
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

TChannel.prototype.request = function request(options) {
    var self = this;
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

    self.destroyed = true;
    self.logger.debug('quitting tchannel', {
        hostPort: self.hostPort
    });

    var counter = 2;
    self.peers.close(onClose);

    if (self.serverSocket) {
        if (self.serverSocket.address()) {
            closeServerSocket();
        } else {
            self.serverSocket.once('listening', closeServerSocket);
        }
    }

    function closeServerSocket() {
        self.serverSocket.once('close', onClose);
        self.serverSocket.close();
    }

    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more sockets than expected', {
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
}
inherits(TChannelConnectionBase, EventEmitter);

TChannelConnectionBase.prototype.close = function close(callback) {
    var self = this;
    self.clearTimeoutTimer();
    self.logger.debug('destroy channel for', {
        direction: self.direction,
        peerRemoteAddr: self.remoteAddr,
        peerRemoteName: self.remoteName
    });
    self.resetAll(new Error('shutdown from quit')); // TODO typed error
    process.nextTick(callback);
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
    if (self.closing) return;
    self.closing = true;

    var inOpKeys = Object.keys(self.inOps);
    var outOpKeys = Object.keys(self.outOps);

    self.logger[err ? 'warn' : 'info']('resetting connection', {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: self.inPending,
        outPending: self.outPending
    });

    self.clearTimeoutTimer();

    self.emit('error', err);

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

    self.emit('socketClose', self, err);
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
TChannelConnectionBase.prototype.request = function request(options) {
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
    process.nextTick(runHandler);

    function runHandler() {
        self.channel.handler.handleRequest(req, buildResponse);
    }

    function buildResponse(options) {
        if (op.res && op.res.state !== reqres.States.Initial) {
            throw new Error('response already built and started'); // TODO: typed error
        }
        op.res = self.buildOutgoingResponse(req, options);
        op.res.once('finish', opDone);
        return op.res;
    }

    function opDone() {
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

    self.reader = ChunkReader(bufrw.UInt16BE, v2.Frame.RW);
    self.writer = ChunkWriter(v2.Frame.RW);
    self.handler = new v2.Handler(extend({
        hostPort: self.channel.hostPort
    }, self.options));

    // TODO: refactor op boundary to pass full req/res around
    self.handler.on('call.incoming.request', function onCallRequest(req) {
        self.handleCallRequest(req);
    });

    self.handler.on('call.incoming.response', function onCallResponse(res) {
        var op = self.popOutOp(res.id);
        if (!op) {
            self.logger.info('response received for unknown or lost operation', {
                responseId: res.id,
                remoteAddr: self.remoteAddr,
                direction: self.direction,
            });
            return;
        }
        op.req.emit('response', res);
    });

    self.handler.on('call.incoming.error', function onCallError(err) {
        var op = self.popOutOp(err.originalId); // TODO bork bork
        if (!op) {
            self.logger.info('error received for unknown or lost operation', err);
            return;
        }

        op.req.emit('error', err);
        // TODO: should terminate corresponding inc res
    });

    self.socket.setNoDelay(true);

    self.socket.on('error', function onSocketError(err) {
        self.onSocketErr(err);
    });
    self.socket.on('close', function onSocketClose() {
        self.onSocketErr(new Error('socket closed')); // TODO typed error
        if (self.remoteName === '0.0.0.0:0') {
            self.channel.peers.delete(self.remoteAddr);
        }
    });

    self.reader.on('data', function onReaderFrame(frame) {
        self.onFrame(frame);
    });
    self.reader.on('error', function onReaderError(err) {
        self.onReaderError(err);
    });

    self.handler.on('error', function onHandlerError(err) {
        self.resetAll(err);
        // resetAll() does not close the socket
        self.socket.destroy();
    });

    if (direction === 'out') {
        self.handler.sendInitRequest();
        self.handler.once('init.response', function onOutIdentified(init) {
            self.remoteName = init.hostPort;
            self.channel.emit('identified', {
                hostPort: init.hostPort,
                processName: init.processName
            });
        });
    } else {
        self.handler.once('init.request', function onInIdentified(init) {
            self.remoteName = init.hostPort;
            self.channel.peers.add(self.remoteName).addConnection(self);
            self.channel.emit('identified', {
                hostPort: init.hostPort,
                processName: init.processName
            });
        });
    }

    self.socket.once('close', clearTimer);

    var stream = self.socket;

    if (dumpEnabled) {
        stream = stream.pipe(Spy(process.stdout, {
            prefix: '>>> ' + self.remoteAddr + ' '
        }));
    }

    stream = stream
        .pipe(self.reader)
        .pipe(self.handler)
        .pipe(self.writer)
        ;

    if (dumpEnabled) {
        stream = stream.pipe(Spy(process.stdout, {
            prefix: '<<< ' + self.remoteAddr + ' '
        }));
    }

    stream = stream
        .pipe(self.socket)
        ;

    function clearTimer() {
        self.timers.clearTimeout(self.timer);
    }

    self.on('timedOut', function onTimedOut() {
        self.logger.warn(self.channel.hostPort + ' destroying socket from timeouts');
        self.socket.destroy();
    });
}
inherits(TChannelConnection, TChannelConnectionBase);

TChannelConnection.prototype.close = function close(callback) {
    var self = this;
    var sock = self.socket;
    sock.once('close', callback);
    self.clearTimeoutTimer();
    self.logger.debug('destroy channel for', {
        direction: self.direction,
        peerRemoteAddr: self.remoteAddr,
        peerRemoteName: self.remoteName,
        fromAddress: sock.address()
    });
    self.resetAll(new Error('shutdown from quit')); // TODO typed error
    sock.destroy();
};

TChannelConnection.prototype.onReaderError = function onReaderError(err) {
    var self = this;

    var readError = TChannelReadProtocolError(err, {
        remoteName: self.remoteName,
        localName: self.channel.hostPort
    });

    // TODO instead of resetting send an error frame first.
    // and reset the socket after sending an error frame
    self.resetAll(readError);
    // resetAll() does not close the socket
    self.socket.destroy();
};

TChannelConnection.prototype.onSocketErr = function onSocketErr(err) {
    var self = this;
    if (!self.closing) {
        self.resetAll(err);
    }
};

TChannelConnection.prototype.onFrame = function onFrame(/* frame */) {
    var self = this;
    if (!self.closing) {
        self.lastTimeoutTime = 0;
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

    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more sockets than expected', {
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
        peer = TChannelPeer(self.channel, hostPort, options);
        self.emit('allocPeer', peer);
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
    self._map[peer.hostPort] = peer;
};

TChannelPeers.prototype.keys = function keys() {
    var self = this;
    var ks = Object.keys(self._map);
    var ret = new Array(ks.length);
    for (var i = 0; i < ks.length; i++) {
        ret[i] = ks[i];
    }
    return ret;
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

TChannelPeers.prototype.delete = function del(hostPort) {
    var self = this;
    var peer = self._map[hostPort];
    delete self._map[hostPort];
    return peer;
};

TChannelPeers.prototype.request = function request(options) {
    var self = this;
    var peers = self.choosePeer(options, null, 1);
    var peer = peers[0];

    if (!peer) {
        throw new Error('no peer available for request'); // TODO: typed error
    }

    if (!peer) {
        // TODO: operational error?
        throw new Error('no peer available for request'); // TODO: typed error
    }
    return peer.request(options);
};

TChannelPeers.prototype.choosePeer = function choosePeer(options, op, n) {
    if (n > 1) throw new Error('not implemented'); // TODO heap select n
    var self = this;

    if (!options) options = {};
    var hosts = null;
    if (options.host) {
        hosts = [options.host];
    } else if (self.options.hosts) {
        hosts = self.options.hosts;
    } else {
        hosts = Object.keys(self._map);
    }
    if (!hosts || !hosts.length) return [];

    var threshold = options.peerScoreThreshold;
    if (threshold === undefined) threshold = self.options.peerScoreThreshold;
    if (threshold === undefined) threshold = 0;

    var selectedPeer = null, selectedScore = 0;
    for (var i = 0; i < hosts.length; i++) {
        var peer = self.add(hosts[i]);
        var score = peer.state.shouldRequest(options, op);
        var want = score > threshold &&
                   (selectedPeer === null || score > selectedScore);
        // TODO: provide visibility... event hook?
        // self.logger.debug('choose peer score', {
        //     host: hosts[i],
        //     score: score,
        //     threshold: threshold,
        //     want: want
        // });
        if (want) {
            selectedPeer = peer;
            selectedScore = score;
        }
    }
    return [selectedPeer];
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

TChannelPeer.prototype.isConnected = function isConnected(direction) {
    var self = this;
    for (var i = 0; i < self.connections.length; i++) {
        var conn = self.connections[i];
        if (direction && conn.direction !== direction) {
            continue;
        } else if (conn.remoteName !== null) {
            return true;
        }
    }
    return false;
};

TChannelPeer.prototype.close = function close(callback) {
    var self = this;
    var counter = self.connections.length;
    if (!counter) {
        callback();
    }
    self.connections.forEach(function eachConn(conn) {
        conn.close(onClose);
    });
    function onClose() {
        if (--counter <= 0) {
            if (counter < 0) {
                self.logger.error('closed more sockets than expected', {
                    counter: counter
                });
            }
            callback();
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

TChannelPeer.prototype.connect = function connect() {
    var self = this;
    var conn;
    for (var i = self.connections.length - 1; i >= 0; i--) {
        conn = self.connections[i];
        if (!conn.closing) return conn;
    }
    var socket = self.makeOutSocket();
    conn = self.makeOutConnection(socket);
    self.addConnection(conn);
    return conn;
};

TChannelPeer.prototype.request = function request(options) {
    var self = this;
    return self.connect().request(options);
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
    var chan = self.channel;
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
    var outreq = reqres.OutgoingRequest(id, options);
    var inreq = reqres.IncomingRequest(id, options);
    inreq.once('error', onError);
    inreq.once('response', onResponse);
    self.handleCallRequest(inreq);
    return outreq;

    function onError(err) {
        self.popOutOp(id);
        inreq.removeListener('response', onResponse);
        outreq.emit('error', err);
    }

    function onResponse(res) {
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

    // options.checksum = v2.Checksum(None);

    options.sendFrame = {
        callResponse: passParts,
        callResponseCont: passParts,
        error: passError
    };
    var outres = reqres.OutgoingResponse(req.id, options);
    var inres = reqres.IncomingResponse(req.id, options);
    var first = true;
    return outres;

    function passParts(args, isLast) {
        inres.handleFrame(args);
        if (isLast) inres.handleFrame(null);
        if (first) {
            first = false;
            req.emit('response', inres);
        }
        if (!self.closing) self.lastTimeoutTime = 0;
    }

    function passError(codeString, message) {
        var err = new Error(format('%s: %s', codeString, message));
        // TODO: proper error classes... requires coupling to v2?
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

function TChannelPeerState(channel) {
    var self = this;
    self.channel = channel;
}

TChannelPeerState.prototype.shouldRequest = function shouldRequest(/* options, op */) {
    // TODO: op isn't quite right currently as a "TChannelClientOp", the
    // intention is that the other (non-options) arg encapsulates all requests
    // across retries and setries
    return 0;
};

function TChannelPeerHealthyState(channel) {
    if (!(this instanceof TChannelPeerHealthyState)) {
        return new TChannelPeerHealthyState(channel);
    }
    var self = this;
    TChannelPeerState.call(self, channel);
}

inherits(TChannelPeerHealthyState, TChannelPeerState);

TChannelPeerHealthyState.prototype.name = 'healthy';

TChannelPeerHealthyState.prototype.shouldRequest = function shouldRequest(/* options, op */) {
    // return Math.random();
    var self = this;
    return 0.2 + self.channel.random() * 0.8;
};

module.exports = TChannel;
