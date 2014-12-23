var parserMod = require('./parser');
var TChannelParser = parserMod.TChannelParser;
var TChannelFrame = parserMod.TChannelFrame;
var types = parserMod.types;

var farmhash = require('farmhash');
var net = require('net');
var inspect = require('util').inspect;

function TChannel(options) {
	var self = this;

	this.options = options || {};
	this.host = this.options.host || '127.0.0.1';
	this.port = this.options.port || 4040;
	this.name = this.host + ':' + this.port;

	this.peers = {};

	this.endpoints = {};

	this.serverSocket = new net.createServer();
	this.serverSocket.listen(this.port, this.host);
	this.serverSocket.on('listening', function () {
		console.log(self.name + ' listening');
		self.emit('listening');
	});
	this.serverSocket.on('error', function (err) {
		console.log(self.name + ' sdkjfdskj server socket error: ' + inspect(err));
	});
	this.serverSocket.on('close', function () {
		console.log('server socket close');
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
	this.peers[name] = connection;
	if (connection.direction === 'out') {
		var self = this;
		connection.on('reset', function (err) {
			delete self.peers[name];
		});
	}
	connection.remoteName = name;
};

TChannel.prototype.send = function (options, arg1, arg2, arg3, callback) {
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
	Object.keys(this.peers).forEach(function (peer) {
		var sock = self.peers[peer].socket;
		if (typeof callback === 'function') {
			sock.once('end', callback);
		}
		sock.end();
	});
	this.serverSocket.close();
};

function TChannelConnection(channel, socket, direction, remoteAddr) {
	var self = this;

	this.channel = channel;
	this.socket = socket;
	this.direction = direction;
	this.remoteAddr = remoteAddr;

	this.remoteName = null; // filled in by identify message

//	console.log(this.channel.name + ' new connection ' + direction + ' ' + this.remoteAddr);

	this.inOps = {};
	this.inPending = 0;
	this.outOps = {};
	this.outPending = 0;

	this.lastSentMessage = 0;
	this.closing = false;

	this.parser = new TChannelParser();

	this.socket.setNoDelay(true);

	this.socket.on('data', function (chunk) {
		self.parser.execute(chunk);
	});
	this.socket.on('error', function (err) {
		self.onSocketErr(err);
	});
	this.socket.on('close', function () {
		console.log(self.channel.name + ' ' + direction + ' ' + self.remoteAddr + ' socket close');
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
}
require('util').inherits(TChannelConnection, require('events').EventEmitter);

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
};

TChannelConnection.prototype.onSocketErr = function (err) {
	console.log(this.channel.name + ' client socket error dir=' + this.direction + ' addr=' + this.remoteAddr + ' message=' + err.message);
	this.resetAll(err);
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
		console.log('server checksum validation failed ' + expected + ' vs ' + actual);
		console.log(inspect(frame));
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

	console.log('error: first req on socket must be identify');
	return false;
};

TChannelConnection.prototype.onFrame = function (frame) {
//	console.log(this.channel.name + ' got frame ' + frame.arg1 + ' ' + frame.arg2);

	if (this.validateChecksum(frame) === false) {
		console.log("error: bad checksum");
	}

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
			console.log('error: not found');
		}
	} else if (frame.header.type === types.res_complete_message) {
		var op = this.outOps[frame.header.id];
		delete this.outOps[frame.header.id];
		this.outPending--;
		op.callback(null, frame.arg2, frame.arg3);
	} else if (frame.header.type === types.res_error) {
		var op = this.outOps[frame.header.id];
		delete this.outOps[frame.header.id];
		this.outPending--;
		return op.callback(new Error(frame.arg1), null, null);
	} else {
		console.log('error: unknown type');
	}
};

TChannelConnection.prototype.sendResFrame = function(frame) {
	var op = this.inOps[frame.header.id];
	delete this.inOps[frame.header.id];
	this.inPending--;

	return this.socket.write(frame.toBuffer());
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

	this.outOps[frame.header.id] = new TChannelClientOp(options, frame, callback);
	this.pendingCount++;
	return this.socket.write(frame.toBuffer());
};

function TChannelClientOp(options, frame, callback) {
	this.options = options;
	this.frame = frame;
	this.callback = callback;
}

module.exports = TChannel;
