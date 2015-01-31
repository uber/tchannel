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

var parserMod = require('./parser');
var TChannelParser = parserMod.TChannelParser;
var TChannelFrame = parserMod.TChannelFrame;
var types = parserMod.types;
var nullLogger = require('./null-logger.js');

var globalClearTimeout = require('timers').clearTimeout;
var globalSetTimeout = require('timers').setTimeout;
var globalNow = Date.now;
var farmhash = require('farmhash');
var net = require('net');
var inspect = require('util').inspect;

function TChannel(options) {
	if (!(this instanceof TChannel)) {
		return new TChannel(options);
	}

	var self = this;

	this.options = options || {};
	this.logger = this.options.logger || nullLogger;
	// TODO do not default the host.
	this.host = this.options.host || '127.0.0.1';
	// TODO do not default the port.
	this.port = this.options.port || 4040;
	this.name = this.host + ':' + this.port;
	this.setTimeout = this.options.timers ?
		this.options.timers.setTimeout : globalSetTimeout;
	this.clearTimeout = this.options.timers ?
		this.options.timers.clearTimeout : globalClearTimeout;
	this.now = this.options.timers ?
		this.options.timers.now : globalNow;

	this.reqTimeoutDefault = this.options.reqTimeoutDefault || 5000;
	this.timeoutCheckInterval = this.options.timeoutCheckInterval || 1000;
	this.timeoutFuzz = this.options.timeoutFuzz || 100;

	this.peers = Object.create(null);

	this.endpoints = Object.create(null);
	this.destroyed = false;

	// TODO do not create a tcp server in the constructor
	// Doing IO in a constructor is bad. Move into a method.
	this.serverSocket = new net.createServer();
	// TODO do not call listen by default. We might want to
	// seperate allocating a server from calling listen on it.
	// We can module.exports a `createTchannel()` helper that
	// calls listen() by default.
	this.serverSocket.listen(this.port, this.host);
	this.serverSocket.on('listening', function () {
		self.logger.info(self.name + ' listening');
		if (!self.destroyed) {
			self.emit('listening');
		}
	});
	this.serverSocket.on('error', function (err) {
		self.logger.error(self.name + ' server socket error: ' + inspect(err));
	});
	this.serverSocket.on('close', function () {
		self.logger.warn('server socket close');
	});
	this.serverSocket.on('connection', function (sock) {
		if (!self.destroyed) {
			var remoteAddr = sock.remoteAddress + ':' + sock.remotePort;
			return new TChannelConnection(self, sock, 'in', remoteAddr);
		}
	});
}
require('util').inherits(TChannel, require('events').EventEmitter);

TChannel.prototype.register = function (op, callback) {
	this.endpoints[op] = callback;
};

TChannel.prototype.setPeer = function (name, conn) {
	if (name === this.name) {
		throw new Error('refusing to set self peer');
	}

	var list = this.peers[name];
	if (!list) {
		list = this.peers[name] = [];
	}

	if (conn.direction === 'out') {
		list.unshift(conn);
	} else {
		list.push(conn);
	}
	return conn;
};
TChannel.prototype.getPeer = function (name) {
	var list = this.peers[name];
	return list && list[0] ? list[0] : null;
};

TChannel.prototype.removePeer = function (name, conn) {
	var list = this.peers[name];
	var index = list ? list.indexOf(conn) : -1;

	if (index === -1) {
		return;
	}

	list.splice(index, 1);
};

TChannel.prototype.getPeers = function () {
	var keys = Object.keys(this.peers);

	var peers = [];
	for (var i = 0; i < keys.length; i++) {
		var list = this.peers[keys[i]];

		for (var j = 0; j < list.length; j++) {
			peers.push(list[j]);
		}
	}

	return peers;
};

TChannel.prototype.addPeer = function (name, connection) {
	if (name === this.name) {
		throw new Error('refusing to add self peer');
	}

	if (!connection) {
		connection = this.makeOutConnection(name);
	}

	if (!connection) {
		connection = this.makeOutConnection(name);
	}

	var existingPeer = this.getPeer(name);
	if (existingPeer !== null && existingPeer !== connection) {
		this.logger.warn('allocated a connection twice', {
			name: name,
			direction: connection.direction
		});
	}

	this.logger.debug('alloc peer', {
		source: this.name,
		destination: name,
		direction: connection.direction
	});
	var self = this;
	connection.on('reset', function (/* err */) {
		// TODO: log?
		self.removePeer(name, connection);
	});
	connection.on('socketClose', function (conn, err) {
		self.emit('socketClose', conn, err);
	});
	return this.setPeer(name, connection);
};

/* jshint maxparams:5 */
TChannel.prototype.send = function (options, arg1, arg2, arg3, callback) {
	if (this.destroyed) {
		throw new Error('cannot send() to destroyed tchannel');
	}

	var dest = options.host;
	if (!dest) {
		throw new Error('cannot send() without options.host');
	}

	var peer = this.getOutConnection(dest);
	peer.send(options, arg1, arg2, arg3, callback);
};
/* jshint maxparams:4 */

TChannel.prototype.getOutConnection = function (dest) {
	var peer = this.getPeer(dest);
	if (!peer) {
		peer = this.addPeer(dest);
	}
	return peer;
};

TChannel.prototype.makeSocket = function (dest) {
	var parts = dest.split(':');
	if (parts.length !== 2) {
		throw new Error('invalid destination');
	}
	var host = parts[0];
	var port = parts[1];
	var socket = net.createConnection({host: host, port: port});
	return socket;
};

TChannel.prototype.makeOutConnection = function (dest) {
	var socket = this.makeSocket(dest);
	var connection = new TChannelConnection(this, socket, 'out', dest);
	return connection;
};

TChannel.prototype.quit = function (callback) {
	var self = this;
	this.destroyed = true;
	var peers = this.getPeers();
	var counter = peers.length + 1;

	this.logger.debug('quitting tchannel', {
		name: this.name
	});

	peers.forEach(function (conn) {
		var sock = conn.socket;
		sock.once('close', onClose);

		if (conn.timer) {
			self.clearTimeout(conn.timer);
		}

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

	var serverSocket = this.serverSocket;
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

	this.channel = channel;
	this.logger = this.channel.logger;
	this.socket = socket;
	this.direction = direction;
	this.remoteAddr = remoteAddr;
	this.timer = null;

	this.remoteName = null; // filled in by identify message

	this.inOps = Object.create(null);
	this.inPending = 0;
	this.outOps = Object.create(null);
	this.outPending = 0;

	this.localEndpoints = Object.create(null);

	this.lastSentMessage = 0;
	this.lastTimeoutTime = 0;
	this.closing = false;

	this.parser = new TChannelParser(this);

	this.socket.setNoDelay(true);

	this.socket.on('data', function (chunk) {
		if (!self.closing) {
			self.parser.execute(chunk);
		}
	});
	this.socket.on('error', function (err) {
		self.onSocketErr('error', err);
	});
	this.socket.on('close', function () {
		self.onSocketErr('close');
	});

	this.parser.on('frame', function (frame) {
		if (!self.closing) {
			self.onFrame(frame);
		}
	});
	this.parser.on('error', function (err) {
		if (!self.closing) {
			// TODO this method is not implemented.
			// We should close the connection.
			self.onParserErr(err);
		}
	});

	this.localEndpoints['TChannel identify'] = function (arg1, arg2, hostInfo, cb) {
		cb(null, self.channel.name, null);
	};

	if (direction === 'out') {
		this.send({}, 'TChannel identify', this.channel.name, null, function onOutIdentify(err, res1/*, res2 */) {
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

	this.startTimeoutTimer();

	socket.once('close', clearTimer);

	function clearTimer() {
		self.channel.clearTimeout(self.timer);
	}
}
require('util').inherits(TChannelConnection, require('events').EventEmitter);

// timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
//   base - fuzz/2 to base + fuzz/2
TChannelConnection.prototype.getTimeoutDelay = function () {
	var base = this.channel.timeoutCheckInterval;
	var fuzz = this.channel.timeoutFuzz;
	return base + Math.round(Math.floor(Math.random() * fuzz) - (fuzz / 2));
};

TChannelConnection.prototype.startTimeoutTimer = function () {
	var self = this;

	this.timer = this.channel.setTimeout(function () {
		self.onTimeoutCheck();
	}, this.getTimeoutDelay());
};

TChannelConnection.prototype.clearTimeoutTimer = function () {
	if (this.timer) {
		clearTimeout(this.timer);
		this.timer = null;
	}
};

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
TChannelConnection.prototype.onTimeoutCheck = function () {
	if (this.closing) {
		return;
	}

	if (this.lastTimeoutTime) {
		this.logger.warn(this.channel.name + ' destroying socket from timeouts');
		this.socket.destroy();
		return;
	}

	var opKeys = Object.keys(this.outOps);
	var now = this.channel.now();
	for (var i = 0; i < opKeys.length ; i++) {
		var op = this.outOps[opKeys[i]];
		if (op === undefined) {
			this.channel.logger
				.warn('unexpected undefined operation', {
					key: opKeys[i],
					op: op
				});
			continue;
		}
		var timeout = op.options.timeout || this.channel.reqTimeoutDefault;
		var duration = now - op.start;
		if (duration > timeout) {
			delete this.outOps[opKeys[i]];
			this.outPending--;
			this.onReqTimeout(op);
		}
	}
	this.startTimeoutTimer();
};

TChannelConnection.prototype.onReqTimeout = function (op) {
	op.timedOut = true;
	op.callback(new Error('timed out'), null, null);
	this.lastTimeoutTime = this.channel.now();
};

// this socket is completely broken, and is going away
// In addition to erroring out all of the pending work, we reset the state in case anybody
// stumbles across this object in a core dump.
TChannelConnection.prototype.resetAll = function (err) {
	this.closing = true;
	this.emit('reset');
	var self = this;

	this.clearTimeoutTimer();

	// requests that we've received we can delete, but these reqs may have started their
	//   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
	//   that once they do finish that their callback will swallow the response.
	Object.keys(this.inOps).forEach(function (id) {
		delete self.inOps[id];
	});

	// for all outgoing requests, forward the triggering error to the user callback
	Object.keys(this.outOps).forEach(function (id) {
		var op = self.outOps[id];
		delete self.outOps[id];
		op.callback(err, null, null);
	});

	this.inPending = 0;
	this.outPending = 0;

	this.emit('socketClose', this, err);
};

TChannelConnection.prototype.onSocketErr = function (type, err) {
	if (this.closing) {
		return;
	}
	this.closing = true;
	var message;
	if (type === 'error') {
		message = err.message;
	} else {
		message = 'socket closed';
	}
	this.resetAll(new Error(message));
};

TChannelConnection.prototype.validateChecksum = function (frame) {
	var actual = farmhash.hash32(frame.arg1);
	if (frame.arg2.length > 0) {
		actual = farmhash.hash32WithSeed(frame.arg2, actual);
	}
	if (frame.arg3.length > 0) {
		actual = farmhash.hash32WithSeed(frame.arg3, actual);
	}
	var expected = frame.header.csum;
	if (expected !== actual) {
		this.logger.warn('server checksum validation failed ' + expected + ' vs ' + actual);
		this.logger.warn(inspect(frame));
		return false;
	} else {
		return true;
	}
};

// when we receive a new connection, we expect the first message to be identify
TChannelConnection.prototype.onIdentify = function (frame) {
	var str1 = frame.arg1.toString();
	var str2 = frame.arg2.toString();
	if (str1 === 'TChannel identify') {
		this.remoteName = str2;
		this.channel.addPeer(str2, this);
		this.channel.emit('identified', str2);
		return true;
	}

	this.logger.error('first req on socket must be identify');
	return false;
};

TChannelConnection.prototype.onFrame = function (frame) {
//	this.logger.info(this.channel.name + ' got frame ' + frame.arg1 + ' ' + frame.arg2);

	if (this.validateChecksum(frame) === false) {
		this.logger.error("bad checksum");
	}

	this.lastTimeoutTime = 0;

	if (frame.header.type === types.reqCompleteMessage) {
		if (this.remoteName === null && this.onIdentify(frame) === false) {
			return;
		}
		this.inOps[frame.header.id] = frame;
		this.inPending++;

		var op = frame.arg1.toString();
		var handler = this.localEndpoints[op] || this.channel.endpoints[op];

		if (typeof handler === 'function') {
			return new TChannelServerOp(this, handler, frame);
		} else {
			// TODO send back some kind of 404 message to the
			// client. It's better if the client gets a not
			// implemented error then a timeout error
			this.logger.error('not found');
		}
	} else if (frame.header.type === types.resCompleteMessage) {
		this.handleResCompleteMessage(frame);
	} else if (frame.header.type === types.resError) {
		this.handleResError(frame);
	} else {
		this.logger.error('unknown type');
	}
};

TChannelConnection.prototype.handleResCompleteMessage = function (frame) {
	var op = this.outOps[frame.header.id];
	if (op) {
		delete this.outOps[frame.header.id];
		this.outPending--;
		op.callback(null, frame.arg2, frame.arg3);
	}
	// TODO else case. We should warn about an incoming response
	// for an operation we did not send out.
	// This could be because of a timeout or could be because
	// of a confused / corrupted server.
};

TChannelConnection.prototype.handleResError = function (frame) {
	var op = this.outOps[frame.header.id];
	if (op) {
		delete this.outOps[frame.header.id];
		this.outPending--;
		return op.callback(new Error(frame.arg1), null, null);
	}
};

TChannelConnection.prototype.sendResFrame = function(frame) {
	var op = this.inOps[frame.header.id];
	if (op) {
		delete this.inOps[frame.header.id];
		this.inPending--;

		return this.socket.write(frame.toBuffer());
	}
};

// send a req frame
/* jshint maxparams:5 */
TChannelConnection.prototype.send = function(options, arg1, arg2, arg3, callback) {
	var frame = new TChannelFrame();

	frame.set(arg1, arg2, arg3);
	frame.header.type = types.reqCompleteMessage;
	// TODO This id will overflow at the 4 million messages mark
	// This can create a very strange race condition where we
	// call an very old operation with a long timeout if we
	// send more then 4 million messages in a certain timeframe
	frame.header.id = ++this.lastSentMessage;
	frame.header.seq = 0;

	// TODO check whether this outOps already exists in case
	// we send more then 4 million messages in a time frame.
	this.outOps[frame.header.id] = new TChannelClientOp(
		options, frame, this.channel.now(), callback);
	this.pendingCount++;
	return this.socket.write(frame.toBuffer());
};
/* jshint maxparams:4 */

function TChannelServerOp(connection, handler, reqFrame) {
	this.connection = connection;
	this.handler = handler;
	this.reqFrame = reqFrame;
	
	var self = this;
	handler(reqFrame.arg2, reqFrame.arg3, connection.remoteName, function responseBind(err, res1, res2) {
		self.onResponse(err, res1, res2);
	});
}

TChannelServerOp.prototype.onResponse = function (err, res1, res2) {
	if (this.closing) {
		return;
	}

	var newFrame = new TChannelFrame();
	if (err) {
		// TODO should the error response contain a head ?
		// Is there any value in sending meta data along with
		// the error.
		newFrame.set(isError(err) ? err.message : err, null, null);
		newFrame.header.type = types.resError;
	} else {
		newFrame.set(this.reqFrame.arg1, res1, res2);
		newFrame.header.type = types.resCompleteMessage;
	}
	newFrame.header.id = this.reqFrame.header.id;
	newFrame.header.seq = 0;

	return this.connection.sendResFrame(newFrame);
};

function isError(obj) {
	return typeof obj === 'object' && (
		Object.prototype.toString.call(obj) === '[object Error]' ||
		obj instanceof Error);
}

function TChannelClientOp(options, frame, start, callback) {
	this.options = options;
	this.frame = frame;
	this.callback = callback;
	this.start = start;
	this.timedOut = false;
}

module.exports = TChannel;
