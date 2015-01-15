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
	this.host = this.options.host || '127.0.0.1';
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

	this.peers = {};

	this.endpoints = {};
	this.destroyed = false;

	this.serverSocket = new net.createServer();
	this.serverSocket.listen(this.port, this.host);
	this.serverSocket.on('listening', function () {
		self.logger.info(self.name + ' listening');
		self.emit('listening');
	});
	this.serverSocket.on('error', function (err) {
		self.logger.error(self.name + ' server socket error: ' + inspect(err));
	});
	this.serverSocket.on('close', function () {
		self.logger.warn('server socket close');
	});
	this.serverSocket.on('connection', function (sock) {
		return new TChannelConnection(self, sock, 'in', sock.remoteAddress + ':' + sock.remotePort);
	});
}
require('util').inherits(TChannel, require('events').EventEmitter);

TChannel.prototype.register = function (op, callback) {
	this.endpoints[op] = callback;
};

TChannel.prototype.addPeer = function (name, connection) {
	if (this.peers[name] !== connection) {
		this.logger.warn('allocated a connection twice', {
			name: name
		});
		// this.peers[name].socket.destroy();
		// return;
	}

	this.logger.debug('alloc peer', {
		source: this.name,
		destination: name
	});
	this.peers[name] = connection;
	var self = this;
	connection.on('reset', function (err) {
		delete self.peers[name];
	});
	connection.on('socketClose', function (conn, err) {
		self.emit('socketClose', conn, err);
	});
	connection.remoteName = name;
};

TChannel.prototype.send = function (options, arg1, arg2, arg3, callback) {
	if (this.destroyed) {
		throw new Error('cannot send() to destroyed tchannel');
	}

	var dest = options.host;

	if (this.peers[dest]) {
		this.peers[dest].send(options, arg1, arg2, arg3, callback);
	} else {
		this.addPeer(dest, this.makeOutConnection(dest));
		this.peers[dest].send(options, arg1, arg2, arg3, callback);
	}
};

TChannel.prototype.makeOutConnection = function (dest) {
	var parts = dest.split(':');
	var socket = net.createConnection({host: parts[0], port: parts[1]});
	var connection = new TChannelConnection(this, socket, 'out', dest);
	connection.remoteName = dest;
	return connection;
};

TChannel.prototype.quit = function (callback) {
	var self = this;
	this.destroyed = true;
	var peerKeys = Object.keys(this.peers);
	var counter = peerKeys.length + 1;

	this.logger.debug('quitting tchannel', {
		name: this.name,
		peerKeys: peerKeys
	});

	peerKeys.forEach(function (peer) {
		var conn = self.peers[peer];
		var sock = conn.socket;
		sock.once('close', onClose);

		if (conn.timer) {
			self.clearTimeout(conn.timer);
		}

		self.logger.debug('destroy channel for', {
			peer: peer,
			fromAddress: sock.address()
		});
		conn.closing = true;
		conn.resetAll(new Error('shutdown from quit'));
		sock.end();
	});

	onClose();

	function onClose() {
		if (--counter === 0 && typeof callback === 'function') {
			callback();
		}
	}


	if (this.serverSocket.address()) {
		this.serverSocket.close();
	} else {
		this.serverSocket.once('listening', function onListen() {
			self.serverSocket.close();
		});
	}
};

function TChannelConnection(channel, socket, direction, remoteAddr) {
	var self = this;

	this.channel = channel;
	this.logger = this.channel.logger;
	this.socket = socket;
	this.direction = direction;
	this.remoteAddr = remoteAddr;

	this.remoteName = null; // filled in by identify message

	this.inOps = {};
	this.inPending = 0;
	this.outOps = {};
	this.outPending = 0;

	this.lastSentMessage = 0;
	this.lastTimeoutTime = 0;
	this.closing = false;

	this.parser = new TChannelParser(this);

	this.socket.setNoDelay(true);

	this.socket.on('data', function (chunk) {
		self.parser.execute(chunk);
	});
	this.socket.on('error', function (err) {
		self.onSocketErr('error', err);
	});
	this.socket.on('close', function () {
		self.onSocketErr('close');
	});

	this.parser.on('frame', function (frame) {
		self.onFrame(frame);
	});
	this.parser.on('error', function (err) {
		self.onParserErr(err);
	});

	this.localEndpoints = {
		'TChannel identify': function (arg1, arg2, hostInfo, cb) {
			cb(null, self.channel.name, null);
		}
	};

	if (direction === 'out') {
		this.send({}, 'TChannel identify', this.channel.name, null, function onOutIdentify(err, res1, res2) {
			if (err) {
				return;
			}
			var remote = res1.toString();
			self.channel.emit('identified', remote);
		});
	}

	this.startTimeoutTimer();
	var socket = this.socket;

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

// If the connection has some success and some timeouts, we should probably leave it up,
// but if everything is timing out, then we should kill the connection.
TChannelConnection.prototype.onTimeoutCheck = function () {
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
		this.channel.addPeer(str2, this);
		this.channel.emit('identified', str2);
		return true;
	}

	this.logger.error('error: first req on socket must be identify');
	return false;
};

TChannelConnection.prototype.onFrame = function (frame) {
//	this.logger.info(this.channel.name + ' got frame ' + frame.arg1 + ' ' + frame.arg2);

	if (this.validateChecksum(frame) === false) {
		this.logger.error("error: bad checksum");
	}

	this.lastTimeoutTime = 0;

	if (frame.header.type === types.req_complete_message) {
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
			this.logger.error('error: not found');
		}
	} else if (frame.header.type === types.res_complete_message) {
		this.handleResCompleteMessage(frame);
	} else if (frame.header.type === types.res_error) {
		this.handleResError(frame);
	} else {
		this.logger.error('error: unknown type');
	}
};

TChannelConnection.prototype.handleResCompleteMessage = function (frame) {
	var op = this.outOps[frame.header.id];
	if (op) {
		delete this.outOps[frame.header.id];
		this.outPending--;
		op.callback(null, frame.arg2, frame.arg3);
	}
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

function TChannelServerOp(connection, fn, reqFrame) {
	this.connection = connection;
	this.fn = fn;
	this.reqFrame = reqFrame;
	
	var self = this;
	fn(reqFrame.arg2, reqFrame.arg3, connection.remoteName, function responseBind(err, res1, res2) {
		self.onResponse(err, res1, res2);
	});
}

TChannelServerOp.prototype.onResponse = function (err, res1, res2) {
	if (this.closing) {
		return;
	}

	var newFrame = new TChannelFrame();
	if (err) {
		newFrame.set(err.message, null, null);
		newFrame.header.type = types.res_error;
	} else {
		newFrame.set(this.reqFrame.arg1, res1, res2);
		newFrame.header.type = types.res_complete_message;
	}
	newFrame.header.id = this.reqFrame.header.id;
	newFrame.header.seq = 0;

	return this.connection.sendResFrame(newFrame);
};

// send a req frame
TChannelConnection.prototype.send = function(options, arg1, arg2, arg3, callback) {
	var frame = new TChannelFrame();

	frame.set(arg1, arg2, arg3);
	frame.header.type = types.req_complete_message;
	frame.header.id = ++this.lastSentMessage;
	frame.header.seq = 0;

	this.outOps[frame.header.id] = new TChannelClientOp(
		options, frame, this.channel.now(), callback);
	this.pendingCount++;
	return this.socket.write(frame.toBuffer());
};

function TChannelClientOp(options, frame, start, callback) {
	this.options = options;
	this.frame = frame;
	this.callback = callback;
	this.start = start;
	this.timedOut = false;
}

module.exports = TChannel;
