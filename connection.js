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
var bufrw = require('bufrw');
var extend = require('xtend');
var ReadMachine = require('bufrw/stream/read_machine');
var inherits = require('util').inherits;

var v2 = require('./v2');
var errors = require('./errors');
var States = require('./reqres_states');

var TChannelConnectionBase = require('./connection_base');

function TChannelConnection(channel, socket, direction, socketRemoteAddr) {
    assert(socketRemoteAddr !== channel.hostPort,
        'refusing to create self connection'
    );

    var self = this;
    TChannelConnectionBase.call(self, channel, direction, socketRemoteAddr);
    self.identifiedEvent = self.defineEvent('identified');

    if (direction === 'out') {
        if (self.channel.emitConnectionMetrics) {
            self.channel.connectionsInitiatedStat.increment(1, {
                'host-port': self.channel.hostPort || '0.0.0.0:0',
                'peer-host-port': socketRemoteAddr
            });
        }
    } else {
        if (self.channel.emitConnectionMetrics) {
            self.channel.connectionsAcceptedStat.increment(1, {
                'host-port': self.channel.hostPort,
                'peer-host-port': socketRemoteAddr
            });
        }
    }

    self.socket = socket;
    self.ephemeral = false;

    var opts = {
        logger: self.channel.logger,
        random: self.channel.random,
        timers: self.channel.timers,
        hostPort: self.channel.hostPort,
        requireAs: self.channel.requireAs,
        requireCn: self.channel.requireCn,
        tracer: self.tracer,
        processName: self.options.processName,
        connection: self
    };

    // jshint forin:true
    self.handler = new v2.Handler(opts);

    self.mach = ReadMachine(bufrw.UInt16BE, v2.Frame.RW);

    self.setupSocket();
    self.setupHandler();
    self.start();
}
inherits(TChannelConnection, TChannelConnectionBase);

TChannelConnection.prototype.setLazyHandling = function setLazyHandling(enabled) {
    var self = this;

    // TODO: push down read machine concern into handler entirely;
    // boundary should just be self.handler.handleChunk in
    // onSocketChunk under setupSocket; then the switching logic
    // moves wholly into a `self.handler.setLazyHandling(bool)`
    if (enabled && self.mach.chunkRW !== v2.LazyFrame.RW) {
        self.mach.chunkRW = v2.LazyFrame.RW;
        self.handler.useLazyFrames(enabled);
    } else if (!enabled && self.mach.chunkRW !== v2.Frame.RW) {
        self.mach.chunkRW = v2.Frame.RW;
        self.handler.useLazyFrames(enabled);
    }
};

TChannelConnection.prototype.setupSocket = function setupSocket() {
    var self = this;

    self.socket.setNoDelay(true);
    // TODO: stream the data with backpressure
    // when you add data event listener you go into
    // a deoptimized mode and you have lost all
    // backpressure on the stream
    self.socket.on('data', onSocketChunk);
    self.socket.on('close', onSocketClose);
    self.socket.on('error', onSocketError);

    // TODO: move to method for function optimization
    function onSocketChunk(chunk) {
        var err = self.mach.handleChunk(chunk);
        if (err) {
            self.sendProtocolError('read', err);
        }
    }

    // TODO: move to method for function optimization
    function onSocketClose() {
        self.resetAll(errors.SocketClosedError({
            reason: 'remote closed',
            socketRemoteAddr: self.socketRemoteAddr,
            direction: self.direction,
            remoteName: self.remoteName
        }));

        if (self.ephemeral) {
            var peer = self.channel.peers.get(self.socketRemoteAddr);
            if (peer) {
                peer.close(noop);
            }
            self.channel.peers.delete(self.socketRemoteAddr);
        }
    }

    function onSocketError(err) {
        self.onSocketError(err);
    }
};

function noop() {}

TChannelConnection.prototype.setupHandler = function setupHandler() {
    var self = this;

    self.setLazyHandling(self.channel.options.useLazyHandling);

    self.handler.write = function write(buf, done) {
        self.socket.write(buf, null, done);
    };

    self.mach.emit = handleReadFrame;

    self.handler.writeErrorEvent.on(onWriteError);
    self.handler.errorEvent.on(onHandlerError);
    self.handler.callIncomingRequestEvent.on(onCallRequest);
    self.handler.callIncomingResponseEvent.on(onCallResponse);
    self.handler.pingIncomingResponseEvent.on(onPingResponse);
    self.handler.callIncomingErrorEvent.on(onCallError);

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
        self.onWriteError(err);
    }

    function onHandlerError(err) {
        self.onHandlerError(err);
    }

    function handleReadFrame(frame) {
        self.handleReadFrame(frame);
    }

    function onCallRequest(req) {
        self.handleCallRequest(req);
    }

    function onCallResponse(res) {
        self.onCallResponse(res);
    }

    function onPingResponse(res) {
        self.handlePingResponse(res);
    }

    function onCallError(err) {
        self.onCallError(err);
    }
};

TChannelConnection.prototype.sendProtocolError =
function sendProtocolError(type, err) {
    var self = this;

    assert(type === 'write' || type === 'read',
        'Got invalid type: ' + type);

    var protocolError;

    if (type === 'read') {
        protocolError = errors.TChannelReadProtocolError(err, {
            remoteName: self.remoteName,
            localName: self.channel.hostPort,
            frameId: err.frameId
        });

        self.channel.inboundProtocolErrorsStat.increment(1, {
            'host-port': self.channel.hostPort || '0.0.0.0:0',
            'peer-host-port': self.socketRemoteAddr
        });

        self.handler.sendErrorFrame({
            id: protocolError.frameId || v2.Frame.NullId
        }, 'ProtocolError', protocolError.message);

        self.resetAll(protocolError);
    } else if (type === 'write') {
        protocolError = errors.TChannelWriteProtocolError(err, {
            remoteName: self.remoteName,
            localName: self.channel.hostPort,
            frameId: err.frameId
        });

        // TODO: what if you have a write error in a call req cont frame
        self.resetAll(protocolError);
    }
};

TChannelConnection.prototype.onWriteError = function onWriteError(err) {
    var self = this;

    self.sendProtocolError('write', err);
};

TChannelConnection.prototype.onHandlerError = function onHandlerError(err) {
    var self = this;

    if (err) {
        self.resetAll(err);
    }
};

TChannelConnection.prototype.handlePingResponse = function handlePingResponse(resFrame) {
    var self = this;
    // TODO: explicit type
    self.pingResponseEvent.emit(self, {id: resFrame.id});
};

TChannelConnection.prototype.handleReadFrame = function handleReadFrame(frame) {
    var self = this;

    if (!self.closing) {
        self.ops.lastTimeoutTime = 0;
    }

    self.handler.handleFrame(frame);
};

TChannelConnection.prototype.onCallResponse = function onCallResponse(res) {
    var self = this;

    var req = self.ops.getOutReq(res.id);
    if (res.state === States.Done || res.state === States.Error) {
        self.ops.popOutReq(res.id, res);
    } else {
        self._deferPopOutReq(res);
    }

    if (!req) {
        return;
    }

    if (self.tracer && !req.forwardTrace) {
        // TODO: better annotations
        req.span.annotate('cr');
        self.tracer.report(req.span);
        res.span = req.span;
    }

    req.emitResponse(res);
};

TChannelConnection.prototype._deferPopOutReq = function _deferPopOutReq(res) {
    var self = this;
    var called = false;

    res.errorEvent.on(popOutReq);
    res.finishEvent.on(popOutReq);

    // TODO: move to method
    function popOutReq() {
        if (called) {
            return;
        }

        called = true;
        self.ops.popOutReq(res.id, res);
    }
};

TChannelConnection.prototype.ping = function ping() {
    var self = this;
    return self.handler.sendPingRequest();
};

TChannelConnection.prototype.onCallError = function onCallError(err) {
    var self = this;

    var req = self.ops.getOutReq(err.originalId);

    if (req && req.res) {
        req.res.errorEvent.emit(req.res, err);
    } else {
        // Only popOutReq if there is no call response object yet
        req = self.ops.popOutReq(err.originalId, err);
        if (!req) {
            return;
        }

        req.emitError(err);
    }
};

TChannelConnection.prototype.start = function start() {
    var self = this;
    if (self.direction === 'out') {
        self.handler.sendInitRequest();
        self.handler.initResponseEvent.on(onOutIdentified);
    } else {
        self.handler.initRequestEvent.on(onInIdentified);
    }

    var now = self.timers.now();
    var initOp = new InitOperation(self, now, self.channel.initTimeout);
    var initTo = self.channel.timeHeap.update(initOp, now);

    function onOutIdentified(init) {
        initTo.cancel();
        self.onOutIdentified(init);
    }

    function onInIdentified(init) {
        initTo.cancel();
        self.onInIdentified(init);
    }
};

TChannelConnection.prototype.onOutIdentified = function onOutIdentified(init) {
    var self = this;

    if (init.hostPort === '0.0.0.0:0') {
        return self.emit('error', errors.EphemeralInitResponse({
            hostPort: init.hostPort,
            socketRemoteAddr: self.socketRemoteAddr,
            processName: init.processName
        }));
    }

    self.remoteName = init.hostPort;
    self.identifiedEvent.emit(self, {
        hostPort: init.hostPort,
        processName: init.processName
    });
};

TChannelConnection.prototype.onInIdentified = function onInIdentified(init) {
    var self = this;
    if (init.hostPort === '0.0.0.0:0') {
        self.ephemeral = true;
        self.remoteName = '' + self.socket.remoteAddress + ':' + self.socket.remotePort;
        assert(self.remoteName !== self.channel.hostPort,
              'should not be able to receive ephemeral connection from self');
    } else {
        self.remoteName = init.hostPort;
    }

    self.channel.peers.add(self.remoteName).addConnection(self);
    self.identifiedEvent.emit(self, {
        hostPort: self.remoteName,
        processName: init.processName
    });
};

TChannelConnection.prototype.close = function close(callback) {
    var self = this;
    if (self.socket.destroyed) {
        callback();
    } else {
        self.socket.once('close', callback);
        self.resetAll(errors.LocalSocketCloseError());
    }
};

TChannelConnection.prototype.onSocketError = function onSocketError(err) {
    var self = this;
    if (!self.closing) {
        self.resetAll(errors.SocketError(err, {
            hostPort: self.channel.hostPort,
            direction: self.direction,
            socketRemoteAddr: self.socketRemoteAddr
        }));
    }
};

TChannelConnection.prototype.nextFrameId = function nextFrameId() {
    var self = this;
    return self.handler.nextFrameId();
};

TChannelConnection.prototype.buildOutRequest = function buildOutRequest(options) {
    var self = this;
    var req = self.handler.buildOutRequest(options);
    req.errorEvent.on(onReqError);
    return req;

    function onReqError(err) {
        self.ops.popOutReq(req.id, err);
    }
};

TChannelConnection.prototype.buildOutResponse = function buildOutResponse(req, options) {
    var self = this;

    options = options || {};
    options.inreq = req;
    options.channel = self.channel;
    options.logger = self.logger;
    options.random = self.random;
    options.timers = self.timers;

    options.tracing = req.tracing;
    options.span = req.span;
    options.checksumType = req.checksum && req.checksum.type;

    // TODO: take over popInReq on req/res error?
    return self.handler.buildOutResponse(req, options);
};

// this connection is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state
// in case anybody stumbles across this object in a core dump.
TChannelConnection.prototype.resetAll = function resetAll(err) {
    var self = this;

    self.ops.destroy();

    err = err || errors.TChannelConnectionCloseError();

    if (self.closing) {
        return;
    }

    self.closing = true;
    self.closeError = err;
    self.socket.destroy();

    var requests = self.ops.getRequests();
    var pending = self.ops.getPending();

    var inOpKeys = Object.keys(requests.in);
    var outOpKeys = Object.keys(requests.out);

    if (!err) {
        err = errors.UnknownConnectionReset();
    }

    if (!self.remoteName && self.channel.emitConnectionMetrics) {
        if (self.direction === 'out') {
            self.channel.connectionsConnectErrorsStat.increment(1, {
                'host-port': self.channel.hostPort || '0.0.0.0:0',
                'peer-host-port': self.socketRemoteAddr
            });
        } else {
            self.channel.connectionsAcceptedErrorsStat.increment(1, {
                'host-port': self.channel.hostPort,
                'peer-host-port': self.socketRemoteAddr
            });
        }
    } else if (self.channel.emitConnectionMetrics) {
        if (err.type !== 'tchannel.socket-local-closed') {
            self.channel.connectionsErrorsStat.increment(1, {
                'host-port': self.channel.hostPort || '0.0.0.0:0',
                'peer-host-port': self.remoteName,
                'type': err.type // TODO unified error type
            });
        }

        self.channel.connectionsClosedStat.increment(1, {
            'host-port': self.channel.hostPort || '0.0.0.0:0',
            'peer-host-port': self.remoteName,
            'reason': err.type // TODO unified reason type
        });
    }

    var logInfo = self.extendLogInfo({
        error: err,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: pending.in,
        outPending: pending.out
    });

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        self.ops.popInReq(id);
        // TODO: support canceling pending handlers
        // TODO report or handle or log errors or something
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var req = self.ops.popOutReq(id);
        if (!req) {
            return;
        }
        req.emitError(makeReqError(req));
    });

    function makeReqError(req) {
        var reqErr = err;
        if (reqErr.type === 'tchannel.socket-local-closed') {
            reqErr = errors.TChannelLocalResetError(reqErr);
        } else {
            reqErr = errors.TChannelConnectionResetError(reqErr);
        }
        return req.extendLogInfo(self.extendLogInfo(reqErr));
    }

    self.ops.clear();

    var errorCodeName = errors.classify(err);
    if (errorCodeName !== 'NetworkError' &&
        errorCodeName !== 'ProtocolError'
    ) {
        self.logger.warn('resetting connection', logInfo);
        self.errorEvent.emit(self, err);
    } else if (
        err.type !== 'tchannel.socket-closed' &&
        err.type !== 'tchannel.socket-local-closed'
    ) {
        logInfo.error = extend(err);
        logInfo.error.message = err.message;
        self.logger.info('resetting connection', logInfo);
    }

    self.closeEvent.emit(self, err);
};

function InitOperation(connection, time, timeout) {
    var self = this;

    self.connection = connection;
    self.time = time;
    self.timeout = timeout;
}

InitOperation.prototype.onTimeout = function onTimeout(now) {
    var self = this;

    // noop if identify succeeded
    if (self.connection.remoteName) {
        return;
    }

    var elapsed = now - self.time;
    var err = errors.ConnectionTimeoutError({
        start: self.time,
        elapsed: elapsed,
        timeout: self.timeout
    });

    self.connection.logger.warn('destroying due to init timeout', self.connection.extendLogInfo({
        error: err
    }));
    self.connection.resetAll(err);
};

module.exports = TChannelConnection;
