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
        self.channel.connectionsInitiatedStat.increment(1, {
            'host-port': self.channel.hostPort || '0.0.0.0:0',
            'peer-host-port': socketRemoteAddr
        });
    } else {
        self.channel.connectionsAcceptedStat.increment(1, {
            'host-port': self.channel.hostPort,
            'peer-host-port': socketRemoteAddr
        });
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
        connection: self
    };
    // jshint forin:false
    for (var prop in self.options) {
        opts[prop] = self.options[prop];
    }
    // jshint forin:true
    self.handler = new v2.Handler(opts);

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
        var err = self.mach.handleChunk(chunk);
        if (err) {
            self.sendProtocolError('read', err);
        }
    }

    function onSocketClose() {
        self.resetAll(errors.SocketClosedError({
            reason: 'remote closed',
            socketRemoteAddr: self.socketRemoteAddr,
            direction: self.direction,
            remoteName: self.remoteName
        }));

        if (self.ephemeral) {
            self.channel.peers.delete(self.socketRemoteAddr);
        }
    }

    function onSocketError(err) {
        self.onSocketError(err);
    }
};

TChannelConnection.prototype.setupHandler = function setupHandler() {
    var self = this;

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
    self.timedOutEvent.on(onTimedOut);

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

    function onTimedOut(err) {
        self.onTimedOut(err);
    }

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
            id: protocolError.frameId || 0xFFFFFFFF
        }, 'ProtocolError', protocolError.message);

        self.resetAll(protocolError);
        self.socket.destroy();
    } else if (type === 'write') {
        protocolError = errors.TChannelWriteProtocolError(err, {
            remoteName: self.remoteName,
            localName: self.channel.hostPort,
            frameId: err.frameId
        });

        // TODO: what if you have a write error in a call req cont frame
        self.resetAll(protocolError);
        self.socket.destroy();
    }
};

TChannelConnection.prototype.onTimedOut = function onTimedOut(err) {
    var self = this;

    self.logger.warn('destroying socket from timeouts', {
        hostPort: self.channel.hostPort
    });
    self.resetAll(err);
    self.socket.destroy();
};

TChannelConnection.prototype.onWriteError = function onWriteError(err) {
    var self = this;

    self.sendProtocolError('write', err);
};

TChannelConnection.prototype.onHandlerError = function onHandlerError(err) {
    var self = this;
    self.resetAll(err);
    // resetAll() does not close the socket
    self.socket.destroy();
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
    self.handler.handleFrame(frame, handledFrame);
    function handledFrame(err) {
        if (err) self.onHandlerError(err);
    }
};

TChannelConnection.prototype.onCallResponse = function onCallResponse(res) {
    var self = this;

    var called = false;
    var req = self.ops.getOutReq(res.id);

    if (res.state === States.Done || res.state === States.Error) {
        popOutReq();
    } else {
        res.errorEvent.on(popOutReq);
        res.finishEvent.on(popOutReq);
    }

    if (!req) {
        return;
    }

    if (self.tracer) {
        // TODO: better annotations
        req.span.annotate('cr');
        self.tracer.report(req.span);
        res.span = req.span;
    }

    req.emitResponse(res);

    function popOutReq() {
        if (called) {
            return;
        }

        called = true;

        self.ops.popOutReq(res.id, {
            responseId: res.id,
            code: res.code,
            arg1: Buffer.isBuffer(res.arg1) ?
                String(res.arg1) : 'streamed-arg1',
            info: 'got call response for unknown id'
        });
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
        req = self.ops.popOutReq(err.originalId, {
            error: err,
            id: err.originalId,
            info: 'got error frame for unknown id'
        });
        if (!req) {
            return;
        }

        req.errorEvent.emit(req, err);
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

    function onOutIdentified(init) {
        self.onOutIdentified(init);
    }

    function onInIdentified(init) {
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
        self.socket.destroy();
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

TChannelConnection.prototype.buildOutRequest = function buildOutRequest(options) {
    var self = this;
    options.logger = self.logger;
    options.random = self.random;
    options.timers = self.timers;
    return self.handler.buildOutRequest(options);
};

TChannelConnection.prototype.buildOutResponse = function buildOutResponse(req, options) {
    var self = this;
    var opts = {
        logger: self.logger,
        random: self.random,
        timers: self.timers
    };
    if (options) {
        // jshint forin:false
        for (var prop in options) {
            opts[prop] = options[prop];
        }
        // jshint forin:true
    }
    return self.handler.buildOutResponse(req, opts);
};

// this connection is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state
// in case anybody stumbles across this object in a core dump.
TChannelConnection.prototype.resetAll = function resetAll(err) {
    var self = this;

    self.ops.destroy();

    if (self.closing) return;
    self.closing = true;
    self.closeError = err;
    self.closeEvent.emit(self, err);

    var requests = self.ops.getRequests();
    var pending = self.ops.getPending();

    var inOpKeys = Object.keys(requests.in);
    var outOpKeys = Object.keys(requests.out);

    if (!err) {
        err = new Error('unknown connection reset'); // TODO typed error
    }

    if (!self.remoteName) {
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
    } else {
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

    var logInfo = {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        socketRemoteAddr: self.socketRemoteAddr,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: pending.in,
        outPending: pending.out
    };

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

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        // TODO: support canceling pending handlers
        self.ops.removeReq(id);
        // TODO report or handle or log errors or something
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var req = requests.out[id];
        self.ops.removeReq(id);

        var info = {
            socketRemoteAddr: self.socketRemoteAddr,
            direction: self.direction,
            remoteName: self.remoteName,
            reqRemoteAddr: req.remoteAddr,
            serviceName: req.serviceName,
            outArg1: String(req.arg1)
        };
        if (err.type === 'tchannel.socket-local-closed') {
            err = errors.TChannelLocalResetError(err, info);
        } else {
            err = errors.TChannelConnectionResetError(err, info);
        }

        req.errorEvent.emit(req, err);
    });

    self.ops.clear();
};

module.exports = TChannelConnection;
