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
    self.serverSocket = new net.createServer();

    if (self.listening) {
        self.listen();
    }

    self.serverSocket.on('listening', function onServerSocketListening() {
        self.logger.info(self.name + ' listening');
        if (!self.destroyed) {
            self.emit('listening');
        }
    });
    self.serverSocket.on('error', function onServerSocketError(err) {
        self.logger.error(self.name + ' server socket error: ' + inspect(err));
    });
    self.serverSocket.on('close', function onServerSocketClose() {
        self.logger.warn('server socket close');
    });
    self.serverSocket.on('connection', function onServerSocketConnection(sock) {
        if (!self.destroyed) {
            var remoteAddr = sock.remoteAddress + ':' + sock.remotePort;
            return new TChannelConnection(self, sock, 'in', remoteAddr);
        }
    });
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

    var peer = self.getOutConnection(dest);
    peer.send(options, arg1, arg2, arg3, callback);
};
/* jshint maxparams:4 */

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

    self.lastSentMessage = 0;
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
            // TODO this method is not implemented.
            // We should close the connection.
            self.onParserErr(err);
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
            var remote = res1.toString();
            self.remoteName = remote;
            self.channel.emit('identified', remote);
        });
    }

    self.startTimeoutTimer();

    socket.once('close', clearTimer);

    function clearTimer() {
        self.channel.clearTimeout(self.timer);
    }
}
require('util').inherits(TChannelConnection, require('events').EventEmitter);

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
    self.closing = true;
    self.clearTimeoutTimer();

    self.emit('reset');

    // requests that we've received we can delete, but these reqs may have started their
    //   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    //   that once they do finish that their callback will swallow the response.
    Object.keys(self.inOps).forEach(function eachInOp(id) {
        // TODO: we could support an op.cancel opt-in callback
        delete self.inOps[id];
    });

    // for all outgoing requests, forward the triggering error to the user callback
    Object.keys(self.outOps).forEach(function eachOutOp(id) {
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

TChannelConnection.prototype.validateChecksum = function validateChecksum(frame) {
    var self = this;
    var actual = frame.checksum();
    var expected = frame.header.csum;
    if (expected !== actual) {
        self.logger.warn('server checksum validation failed ' + expected + ' vs ' + actual);
        self.logger.warn(inspect(frame));
        return false;
    } else {
        return true;
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

    if (self.validateChecksum(frame) === false) {
        // TODO: reduce the log spam: validateChecksum emits 2x warn logs, then
        // we have a less than informative error log here... use a structured
        // error out of validation and log it here instead
        self.logger.error("bad checksum");
    }

    self.lastTimeoutTime = 0;

    if (frame.header.type === v1.Types.reqCompleteMessage) {
        if (self.remoteName === null && self.onIdentify(frame) === false) {
            return;
        }
        self.handleReqFrame(frame);
    } else if (frame.header.type === v1.Types.resCompleteMessage) {
        self.handleResCompleteMessage(frame);
    } else if (frame.header.type === v1.Types.resError) {
        self.handleResError(frame);
    } else {
        self.logger.error('unknown frame type', {
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
    var opCallback = responseFrameBuilder(reqFrame, sendResponse);
    var op = self.inOps[id] = new TChannelServerOp(self,
        handler, reqFrame, self.channel.now(), {}, opCallback);

    function sendResponse(err, handlerErr, resFrame) {
        if (err) {
            // TODO: add more log context
            self.logger.error(err);
            return;
        }
        if (self.closing) {
            return;
        }
        if (self.inOps[id] !== op) {
            // TODO log...
            return;
        }
        // TODO: observability hook for handler errors
        var buf = resFrame.toBuffer();
        delete self.inOps[id];
        self.inPending--;
        self.socket.write(buf);
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
    if (op) {
        delete self.outOps[id];
        self.outPending--;
        op.callback(err, arg1, arg2);
    // } else { // TODO log...
    }
    // TODO else case. We should warn about an incoming response
    // for an operation we did not send out.
    // This could be because of a timeout or could be because
    // of a confused / corrupted server.
};

TChannelConnection.prototype.sendInitRequest = function sendInitRequest(callback) {
    var self = this;
    self.send({}, 'TChannel identify', self.channel.name, null, callback);
};

// send a req frame
/* jshint maxparams:5 */
TChannelConnection.prototype.send = function send(options, arg1, arg2, arg3, callback) {
    var self = this;
    var frame = new v1.Frame();

    frame.set(arg1, arg2, arg3);
    frame.header.type = v1.Types.reqCompleteMessage;
    // TODO This id will overflow at the 4 million messages mark
    // This can create a very strange race condition where we
    // call an very old operation with a long timeout if we
    // send more then 4 million messages in a certain timeframe
    frame.header.id = ++self.lastSentMessage;
    frame.header.seq = 0;

    // TODO check whether this outOps already exists in case
    // we send more then 4 million messages in a time frame.
    self.outOps[frame.header.id] = new TChannelClientOp(
        options, frame, self.channel.now(), callback);
    self.pendingCount++;
    return self.socket.write(frame.toBuffer());
};
/* jshint maxparams:4 */

/* jshint maxparams:6 */
function TChannelServerOp(connection, handler, reqFrame, start, options, callback) {
    var self = this;
    self.connection = connection;
    self.handler = handler;
    self.reqFrame = reqFrame;
    self.timedOut = false;
    self.start = start;
    self.options = options;
    handler(reqFrame.arg2, reqFrame.arg3, connection.remoteName, callback);
}
/* jshint maxparams:4 */

function responseFrameBuilder(reqFrame, callback) {
    var id = reqFrame.header.id;
    var arg1 = reqFrame.arg1;
    var sent = false;
    var resFrame = new v1.Frame();
    resFrame.header.id = id;
    resFrame.header.seq = 0;
    return function buildResponseFrame(handlerErr, res1, res2) {
        if (sent) {
            return callback(new Error('response already sent', {
                handlerErr: handlerErr,
                res1: res1,
                res2: res2
            }));
        }
        sent = true;
        if (handlerErr) {
            // TODO should the error response contain a head ?
            // Is there any value in sending meta data along with
            // the error.
            resFrame.set(isError(handlerErr) ? handlerErr.message : handlerErr, null, null);
            resFrame.header.type = v1.Types.resError;
        } else {
            resFrame.set(arg1, res1, res2);
            resFrame.header.type = v1.Types.resCompleteMessage;
        }
        callback(null, handlerErr, resFrame);
    };
}

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
