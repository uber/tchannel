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

var v1 = require('./v1');
var nullLogger = require('./null-logger.js');
var globalClearTimeout = require('timers').clearTimeout;
var globalSetTimeout = require('timers').setTimeout;
var globalNow = Date.now;
var globalRandom = Math.random;
var net = require('net');
var inspect = require('util').inspect;

function TChannel(options) {
    if (!(this instanceof TChannel)) {
        return new TChannel(options);
    }

    var self = this;

    self.options = options || {};
    self.logger = self.options.logger || nullLogger;
    // TODO do not default the host.
    self.host = self.options.host || '127.0.0.1';
    // TODO do not default the port.
    self.port = self.options.port || 4040;
    self.name = self.host + ':' + self.port;
    self.random = self.options.random ?
        self.options.random : globalRandom;
    self.setTimeout = self.options.timers ?
        self.options.timers.setTimeout : globalSetTimeout;
    self.clearTimeout = self.options.timers ?
        self.options.timers.clearTimeout : globalClearTimeout;
    self.now = self.options.timers ?
        self.options.timers.now : globalNow;

    self.reqTimeoutDefault = self.options.reqTimeoutDefault || 5000;
    self.serverTimeoutDefault = self.options.serverTimeoutDefault || 5000;
    self.timeoutCheckInterval = self.options.timeoutCheckInterval || 1000;
    self.timeoutFuzz = self.options.timeoutFuzz || 100;

    self.peers = Object.create(null);

    self.endpoints = Object.create(null);
    self.destroyed = false;
    // to provide backward compatibility.
    self.listening = self.options.listening === false ?
      false : true;
    self.serverSocket = new net.createServer(function onServerSocketConnection(sock) {
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
            self.logger.info(self.name + ' listening');
            self.emit('listening');
        }
    });
    self.serverSocket.on('error', function onServerSocketError(err) {
        self.logger.error(self.name + ' server socket error: ' + inspect(err));
    });
    self.serverSocket.on('close', function onServerSocketClose() {
        self.logger.warn('server socket close');
    });

    if (self.listening) {
        self.listen();
    }
}
require('util').inherits(TChannel, require('events').EventEmitter);

// Decoulping config and creation from the constructor.
// This also allows us to better unit test the code as the test process
// is not blocked by the listening connections
TChannel.prototype.listen = function listen() {
    var self = this;
    if (!self.serverSocket) {
        throw new Error('Missing server Socket.');
    }
    if (!self.host) {
        throw new Error('Missing server host.');
    }
    if (!self.port) {
        throw new Error('Missing server port.');
    }

    self.serverSocket.listen(self.port, self.host);
};


TChannel.prototype.register = function register(op, callback) {
    var self = this;
    self.endpoints[op] = callback;
};

TChannel.prototype.setPeer = function setPeer(name, conn) {
    var self = this;
    if (name === self.name) {
        throw new Error('refusing to set self peer');
    }

    var list = self.peers[name];
    if (!list) {
        list = self.peers[name] = [];
    }

    if (conn.direction === 'out') {
        list.unshift(conn);
    } else {
        list.push(conn);
    }
    return conn;
};
TChannel.prototype.getPeer = function getPeer(name) {
    var self = this;
    var list = self.peers[name];
    return list && list[0] ? list[0] : null;
};

TChannel.prototype.removePeer = function removePeer(name, conn) {
    var self = this;
    var list = self.peers[name];
    var index = list ? list.indexOf(conn) : -1;

    if (index === -1) {
        return;
    }

    // TODO: run (don't walk) away from "arrays" as peers, get to actual peer
    // objects... note how these current semantics can implicitly convert
    // an in socket to an out socket
    list.splice(index, 1);
};

TChannel.prototype.getPeers = function getPeers() {
    var self = this;
    var keys = Object.keys(self.peers);

    var peers = [];
    for (var i = 0; i < keys.length; i++) {
        var list = self.peers[keys[i]];

        for (var j = 0; j < list.length; j++) {
            peers.push(list[j]);
        }
    }

    return peers;
};

TChannel.prototype.addPeer = function addPeer(name, connection) {
    var self = this;
    if (name === self.name) {
        throw new Error('refusing to add self peer');
    }

    if (!connection) {
        connection = self.makeOutConnection(name);
    }

    var existingPeer = self.getPeer(name);
    if (existingPeer !== null && existingPeer !== connection) { // TODO: how about === undefined?
        self.logger.warn('allocated a connection twice', {
            name: name,
            direction: connection.direction
            // TODO: more log context
        });
    }

    self.logger.debug('alloc peer', {
        source: self.name,
        destination: name,
        direction: connection.direction
        // TODO: more log context
    });
    connection.on('reset', function onConnectionReset(/* err */) {
        // TODO: log?
        self.removePeer(name, connection);
    });
    connection.on('socketClose', function onConnectionSocketClose(conn, err) {
        self.emit('socketClose', conn, err);
    });
    return self.setPeer(name, connection);
};

/* jshint maxparams:5 */
TChannel.prototype.send = function send(options, arg1, arg2, arg3, callback) {
    var self = this;
    if (self.destroyed) {
        throw new Error('cannot send() to destroyed tchannel');
    }

    var dest = options.host;
    if (!dest) {
        throw new Error('cannot send() without options.host');
    }

    var reqFrame = self.buildRequest(options, arg1, arg2, arg3);
    var peer = self.getOutConnection(dest);
    peer.send(options, reqFrame, callback);
};
/* jshint maxparams:4 */

TChannel.prototype.buildRequest = function buildRequest(options, arg1, arg2, arg3) {
    var reqFrame = new v1.Frame();
    reqFrame.set(arg1, arg2, arg3);
    reqFrame.header.type = v1.Types.reqCompleteMessage;
    return reqFrame;
};

TChannel.prototype.getOutConnection = function getOutConnection(dest) {
    var self = this;
    var peer = self.getPeer(dest);
    if (!peer) {
        peer = self.addPeer(dest);
    }
    return peer;
};

TChannel.prototype.makeSocket = function makeSocket(dest) {
    var parts = dest.split(':');
    if (parts.length !== 2) {
        throw new Error('invalid destination');
    }
    var host = parts[0];
    var port = parts[1];
    var socket = net.createConnection({host: host, port: port});
    return socket;
};

TChannel.prototype.makeOutConnection = function makeOutConnection(dest) {
    var self = this;
    var socket = self.makeSocket(dest);
    var connection = new TChannelConnection(self, socket, 'out', dest);
    return connection;
};

TChannel.prototype.quit = function quit(callback) {
    var self = this;
    self.destroyed = true;
    var peers = self.getPeers();
    var counter = peers.length + 1;

    self.logger.debug('quitting tchannel', {
        name: self.name
    });

    peers.forEach(function eachPeer(conn) {
        var sock = conn.socket;
        sock.once('close', onClose);

        conn.clearTimeoutTimer();

        self.logger.debug('destroy channel for', {
            direction: conn.direction,
            peerRemoteAddr: conn.remoteAddr,
            peerRemoteName: conn.remoteName,
            fromAddress: sock.address()
        });
        conn.closing = true;
        conn.resetAll(new Error('shutdown from quit'));
        sock.end();
    });

    var serverSocket = self.serverSocket;
    if (serverSocket.address()) {
        closeServerSocket();
    } else {
        serverSocket.once('listening', closeServerSocket);
    }

    function closeServerSocket() {
        serverSocket.once('close', onClose);
        serverSocket.close();
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

function TChannelConnection(channel, socket, direction, remoteAddr) {
    var self = this;
    if (remoteAddr === channel.name) {
        throw new Error('refusing to create self connection');
    }

    self.channel = channel;
    self.logger = self.channel.logger;
    self.socket = socket;
    self.direction = direction;
    self.remoteAddr = remoteAddr;
    self.timer = null;

    self.remoteName = null; // filled in by identify message

    // TODO: factor out an operation collection abstraction
    self.inOps = Object.create(null);
    self.inPending = 0;
    self.outOps = Object.create(null);
    self.outPending = 0;

    self.localEndpoints = Object.create(null);

    self.lastSentFrameId = 0;
    self.lastTimeoutTime = 0;
    self.closing = false;

    self.parser = new v1.Parser(self);

    self.socket.setNoDelay(true);

    self.socket.on('data', function onSocketData(chunk) {
        if (!self.closing) {
            self.parser.execute(chunk);
        }
    });
    self.socket.on('error', function onSocketError(err) {
        self.onSocketErr(err);
    });
    self.socket.on('close', function onSocketClose() {
        self.onSocketErr(new Error('socket closed'));
    });

    self.parser.on('frame', function onParserFrame(frame) {
        if (!self.closing) {
            self.onFrame(frame);
        }
    });
    self.parser.on('error', function onParserError(err) {
        if (!self.closing) {
            self.onParserError(err);
        }
    });

    self.localEndpoints['TChannel identify'] = function identifyEndpoint(arg1, arg2, hostInfo, cb) {
        cb(null, self.channel.name, null);
    };

    if (direction === 'out') {
        self.sendInitRequest(function onOutIdentify(err, res1/*, res2 */) {
            if (err) {
                self.channel.logger.error('identification error', {
                    remoteAddr: remoteAddr,
                    error: err
                });
                return;
            }
            self.handleInitResponse(res1.toString());
        });
    }

    self.startTimeoutTimer();

    socket.once('close', clearTimer);

    function clearTimer() {
        self.channel.clearTimeout(self.timer);
    }
}
require('util').inherits(TChannelConnection, require('events').EventEmitter);

TChannelConnection.prototype.onParserError = function onParserError(err) {
    var self = this;
    self.channel.logger.error('tchannel parse error', {
        remoteName: self.remoteName,
        localName: self.channel.name,
        error: err
    });
    // TODO should we close the connection?
};

TChannelConnection.prototype.nextFrameId = function nextFrameId() {
    var self = this;
    self.lastSentFrameId = (self.lastSentFrameId + 1) % 0xffffffff;
    return self.lastSentFrameId;
};

// timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
//   base - fuzz/2 to base + fuzz/2
TChannelConnection.prototype.getTimeoutDelay = function getTimeoutDelay() {
    var self = this;
    var base = self.channel.timeoutCheckInterval;
    var fuzz = self.channel.timeoutFuzz;
    return base + Math.round(Math.floor(self.channel.random() * fuzz) - (fuzz / 2));
};

TChannelConnection.prototype.startTimeoutTimer = function startTimeoutTimer() {
    var self = this;
    self.timer = self.channel.setTimeout(function onChannelTimeout() {
        // TODO: worth it to clear the fired self.timer objcet?
        self.onTimeoutCheck();
    }, self.getTimeoutDelay());
};

TChannelConnection.prototype.clearTimeoutTimer = function clearTimeoutTimer() {
    var self = this;
    if (self.timer) {
        self.channel.clearTimeout(self.timer);
        self.timer = null;
    }
};

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
TChannelConnection.prototype.onTimeoutCheck = function onTimeoutCheck() {
    var self = this;
    if (self.closing) {
        return;
    }

    if (self.lastTimeoutTime) {
        self.logger.warn(self.channel.name + ' destroying socket from timeouts');
        self.socket.destroy();
        return;
    }

    self.checkOutOpsForTimeout(self.outOps);
    self.checkInOpsForTimeout(self.inOps);

    self.startTimeoutTimer();
};

TChannelConnection.prototype.checkInOpsForTimeout = function checkInOpsForTimeout(ops) {
    var self = this;
    var opKeys = Object.keys(ops);
    var now = self.channel.now();

    for (var i = 0; i < opKeys.length; i++) {
        var opKey = opKeys[i];
        var op = ops[opKey];

        if (op === undefined) {
            continue;
        }

        var timeout = self.channel.serverTimeoutDefault;
        var duration = now - op.start;
        if (duration > timeout) {
            delete ops[opKey];
            self.inPending--;
        }
    }
};

TChannelConnection.prototype.checkOutOpsForTimeout = function checkOutOpsForTimeout(ops) {
    var self = this;
    var opKeys = Object.keys(ops);
    var now = self.channel.now();
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
        var timeout = op.options.timeout || self.channel.reqTimeoutDefault;
        var duration = now - op.start;
        if (duration > timeout) {
            delete ops[opKey];
            self.outPending--;
            self.onReqTimeout(op);
        }
    }
};

TChannelConnection.prototype.onReqTimeout = function onReqTimeout(op) {
    var self = this;
    op.timedOut = true;
    op.callback(new Error('timed out'), null, null);
    self.lastTimeoutTime = self.channel.now();
};

// this socket is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state in case anybody
// stumbles across this object in a core dump.
TChannelConnection.prototype.resetAll = function resetAll(err) {
    var self = this;
    if (self.closing) return;
    self.closing = true;

    var inOpKeys = Object.keys(self.inOps);
    var outOpKeys = Object.keys(self.outOps);

    self.logger[err ? 'warn' : 'info']('resetting all connections', {
        error: err,
        remoteName: self.remoteName,
        localName: self.channel.hostPort,
        numInOps: inOpKeys.length,
        numOutOps: outOpKeys.length,
        inPending: self.inPending,
        outPending: self.outPending
    });

    self.clearTimeoutTimer();

    self.emit('reset');

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach(function eachInOp(id) {
        // TODO: we could support an op.cancel opt-in callback
        delete self.inOps[id];
    });

    // for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach(function eachOutOp(id) {
        var op = self.outOps[id];
        delete self.outOps[id];
        // TODO: shared mutable object... use Object.create(err)?
        op.callback(err, null, null);
    });

    self.inPending = 0;
    self.outPending = 0;

    self.emit('socketClose', self, err);
};

TChannelConnection.prototype.onSocketErr = function onSocketErr(err) {
    var self = this;
    if (!self.closing) {
        self.resetAll(err);
    }
};

// when we receive a new connection, we expect the first message to be identify
TChannelConnection.prototype.onIdentify = function onIdentify(frame) {
    var self = this;
    var str1 = frame.arg1.toString();
    var str2 = frame.arg2.toString();
    if (str1 === 'TChannel identify') {
        self.remoteName = str2;
        self.channel.addPeer(str2, self);
        self.channel.emit('identified', str2);
        return true;
    }

    self.logger.error('first req on socket must be identify');
    return false;
};

TChannelConnection.prototype.onFrame = function onFrame(frame) {
    var self = this;

    self.lastTimeoutTime = 0;
    switch (frame.header.type) {
        case v1.Types.reqCompleteMessage:
            if (self.remoteName === null && self.onIdentify(frame) === false) {
                return;
            }
            return self.handleReqFrame(frame);
        case v1.Types.resCompleteMessage:
            return self.handleResCompleteMessage(frame);
        case v1.Types.resError:
            return self.handleResError(frame);
        default:
            self.logger.error('unhandled frame type', {
                type: frame.header.type
            });
    }
};

TChannelConnection.prototype.handleReqFrame = function handleReqFrame(reqFrame) {
    var self = this;
    var id = reqFrame.header.id;
    var name = reqFrame.arg1.toString();

    var handler = self.localEndpoints[name] || self.channel.endpoints[name];

    if (typeof handler !== 'function') {
        // TODO: test this behavior, in fact the prior early return subtlety
        // broke tests in an unknown way after deferring the inOps mutation
        // until after old handler verification without this... arguably it's
        // what we want anyhow, but that weird test failure should be
        // understood
        handler = function noSuchHandler(arg2, arg3, remoteAddr, cb) {
            var err = new Error('no such operation');
            err.op = name;
            cb(err, null, null);
        };
        return;
    }

    self.inPending++;
    var op = self.inOps[id] = new TChannelServerOp(self,
        handler, reqFrame, self.channel.now(), {}, sendFrame);

    function sendFrame(resFrame) {
        if (self.inOps[id] !== op) {
            self.logger.warn('attempt to send frame for mismatched operation', {
                hostPort: self.channel.name,
                opId: id
            });
            return;
        }
        delete self.inOps[id];
        self.inPending--;
        if (!self.closing) {
            var buf = resFrame.toBuffer();
            self.socket.write(buf);
        }
    }
};

TChannelConnection.prototype.handleResCompleteMessage = function handleResCompleteMessage(frame) {
    var self = this;
    self.completeOutOp(frame.header.id, null, frame.arg2, frame.arg3);
};

TChannelConnection.prototype.handleResError = function handleResError(frame) {
    var self = this;
    var err = new Error(frame.arg1);
    self.completeOutOp(frame.header.id, err, null, null);
};

TChannelConnection.prototype.completeOutOp = function completeOutOp(id, err, arg1, arg2) {
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
    op.callback(err, arg1, arg2);
};

TChannelConnection.prototype.sendInitRequest = function sendInitRequest(callback) {
    var self = this;
    var reqFrame = new v1.Frame();
    reqFrame.set('TChannel identify', self.channel.name, null);
    reqFrame.header.type = v1.Types.reqCompleteMessage;
    self.send({}, reqFrame, callback);
};

TChannelConnection.prototype.handleInitResponse = function handleInitResponse(res) {
    var self = this;
    var remote = res;
    self.remoteName = remote;
    self.channel.emit('identified', remote);
};

// send a req frame
/* jshint maxparams:5 */
TChannelConnection.prototype.send = function send(options, frame, callback) {
    var self = this;
    var id = self.nextFrameId();
    // TODO: use this to protect against >4Mi outstanding messages edge case
    // (e.g. zombie operation bug, incredible throughput, or simply very long
    // timeout
    // if (self.outOps[id]) {
    //  throw new Error('duplicate frame id in flight');
    // }

    frame.header.id = id;
    frame.header.seq = 0;
    self.outOps[id] = new TChannelClientOp(
        options, frame, self.channel.now(), callback);
    self.pendingCount++;
    var buffer = frame.toBuffer();
    return self.socket.write(buffer);
};
/* jshint maxparams:4 */

/* jshint maxparams:6 */
function TChannelServerOp(connection, handler, reqFrame, start, options, sendFrame) {
    var self = this;
    self.connection = connection;
    self.logger = connection.logger;
    self.handler = handler;
    self.reqFrame = reqFrame;
    self.timedOut = false;
    self.start = start;
    self.options = options;
    self.sendFrame = sendFrame;
    self.responseSent = false;
    process.nextTick(function runHandler() {
        self.handler(reqFrame.arg2, reqFrame.arg3, connection.remoteName, sendResponse);
    });
    function sendResponse(err, res1, res2) {
        self.sendResponse(err, res1, res2);
    }
}
/* jshint maxparams:4 */

TChannelServerOp.prototype.sendResponse = function sendResponse(err, res1, res2) {
    var self = this;
    if (self.responseSent) {
        self.logger.error('response already sent', {
            err: err,
            res1: res1,
            res2: res2
        });
        return;
    }
    self.responseSent = true;
    // TODO: observability hook for handler errors
    var resFrame = self.buildResponseFrame(err, res1, res2);
    self.sendFrame(resFrame);
};

TChannelServerOp.prototype.buildResponseFrame = function buildResponseFrame(err, res1, res2) {
    var self = this;
    var id = self.reqFrame.header.id;
    var arg1 = self.reqFrame.arg1;
    var resFrame = new v1.Frame();
    resFrame.header.id = id;
    resFrame.header.seq = 0;
    if (err) {
        // TODO should the error response contain a head ?
        // Is there any value in sending meta data along with
        // the error.
        resFrame.set(isError(err) ? err.message : err, null, null);
        resFrame.header.type = v1.Types.resError;
    } else {
        resFrame.set(arg1, res1, res2);
        resFrame.header.type = v1.Types.resCompleteMessage;
    }
    return resFrame;
};

function isError(obj) {
    return typeof obj === 'object' && (
        Object.prototype.toString.call(obj) === '[object Error]' ||
        obj instanceof Error);
}

function TChannelClientOp(options, frame, start, callback) {
    var self = this;
    self.options = options;
    self.frame = frame;
    self.callback = callback;
    self.start = start;
    self.timedOut = false;
}

module.exports = TChannel;
