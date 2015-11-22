'use strict';

var Buffer = require('buffer').Buffer;
var process = require('process');

// var FrameParser = require('./parser.js');
// var LazyFrame = require('./lazy-frame.js');

var GUID = 1;

module.exports = RelayConnection;

function RelayConnection(socket, relay, direction) {
    if (!(this instanceof RelayConnection)) {
        return new RelayConnection(socket, relay, direction);
    }

    var self = this;

    self.socket = socket;
    self.relay = relay;
    self.socket.owner = self;

    self.parser = new FrameParser(self, onFrameBuffer);
    self.idCounter = 1;
    self.guid = String(GUID++) + '~';
    self.outRequestMapping = Object.create(null);

    self.initialized = false;
    self.frameQueue = [];
    self.writeQueue = [];
    self.direction = direction;
    self.afterWriteCallback = null;

    self.pendingWrite = false;
    self.connected = false;
}

RelayConnection.prototype.accept = function accept() {
    var self = this;

    self.connected = true;
    self.readStart();
}

RelayConnection.prototype.readStart = function readStart() {
    var self = this;

    self.socket.onread = onRead;
    var err = self.socket.readStart();
    if (err) {
        console.error('could not readStart lul', err);
        return;
    }
};

RelayConnection.prototype.connect = function connect(hostPort) {
    var self = this;

    var parts = hostPort.split(':');
    var connectReq = self.socket.connect(parts[0], parts[1])
    if (connectReq === null) {
        console.error('could not connect', process._errno);
        return;
    }

    connectReq.oncomplete = afterConnect;
};

function afterConnect(err, socket, req, readable, writable) {
    var conn = socket.owner;

    if (err) {
        console.error('lol connect', err);
        return;
    }

    if (!readable || !writable) {
        console.error('bad socket :(');
        return;
    }

    conn.connected = true;
    conn.readStart();

    if (conn.direction === 'out') {
        // console.log('sendInitRequest');
        conn.sendInitRequest();
    }
}

function onRead(buffer, offset, length) {
    if (buffer) {
        var conn = this.owner;
        // console.log('gotn socket buffer', {
        //     guid: conn.guid,
        //     bufStr: buffer.slice(offset, offset + length).toString('utf8')
        // });
        conn.onSocketRead(buffer, offset, offset + length);
    } else if (process._errno == 'EOF') {
        // console.log('got EOF LOLOLOLOLOLOL');
        // socket close (TODO lololol)
        return;
    } else {
        console.error('read failed', process._errno);
        return;
    }
}

RelayConnection.prototype.onSocketRead =
function onSocketRead(buffer, offset, length) {
    var self = this;

    if (length === 0) {
        // could have no bytes
        return;
    }

    self.onSocketBuffer(buffer, offset, length);
};

RelayConnection.prototype.onSocketBuffer =
function onSocketBuffer(socketBuffer, start, length) {
    var self = this;

    self.parser.write(socketBuffer, start, length);
};

RelayConnection.prototype.onFrameBuffer =
function onFrameBuffer(frameBuffer) {
    var self = this;

    var frame = LazyFrame.alloc(self, frameBuffer);
    self.relay.handleFrame(frame);
};

RelayConnection.prototype.allocateId = function allocateId() {
    var self = this;

    return self.idCounter++;
};

RelayConnection.prototype.writeFrame = function writeFrame(frame) {
    var self = this;

    if (self.initialized) {
        self.writeToSocket(frame.frameBuffer);
    } else {
        self.frameQueue.push(frame.frameBuffer);
    }
};

RelayConnection.prototype.writeToSocket = function writeToSocket(buffer) {
    var self = this;

    // if (self.pendingWrite) {
    //     self.writeQueue.push(buffer);
    //     return;
    // }

    if (!self.connected) {
        throw new Error('lol noob');
    }

    self.pendingWrite = true;

    // console.log('writing to socket', self.guid);
    var writeReq = self.socket.writeBuffer(buffer);
    if (!writeReq) {
        console.error('did not get writeReq');
        return;
    }

    writeReq.oncomplete = afterWrite;
};

function afterWrite(status, socket, writeReq) {
    var conn = socket.owner;

    if (status) {
        console.error('write failed', status);
        return;
    }

    if (conn.afterWriteCallback) {
        conn.afterWriteCallback();
    }

    conn.pendingWrite = false;
    // if (conn.writeQueue.length) {
    //     conn.writeToSocket(conn.writeQueue.shift());
    // }
}

RelayConnection.prototype.handleInitRequest =
function handleInitRequest(reqFrame) {
    var self = this;

    // magicCounters.in++;
    // console.log('handleInitRequest', magicCounters.in);

    reqFrame.readId();
    self.sendInitResponse(reqFrame);
};

RelayConnection.prototype.sendInitResponse =
function sendInitResponse(reqFrame) {
    var self = this;

    // magicCounters.in--;
    // console.log('handleInitResponse', magicCounters.in);

    var bufferLength = initFrameSize(self.relay.hostPort);
    var buffer = new Buffer(bufferLength);
    var offset = 0;

    offset = writeFrameHeader(
        buffer, offset, bufferLength, 0x02, reqFrame.oldId
    );
    offset = writeInitBody(
        buffer, offset, self.relay.hostPort
    );

    self.afterWriteCallback = onWrite;
    self.writeToSocket(buffer);
};

function onWrite() {
    var self = this;

    self.afterWriteCallback = null;
    self.flushPending();
}

RelayConnection.prototype.sendInitRequest =
function sendInitRequest() {
    var self = this;

    // magicCounters.out++;
    // console.log('sendInitRequest', magicCounters.out);

    var bufferLength = initFrameSize(self.relay.hostPort);
    var buffer = new Buffer(bufferLength);
    var offset = 0;

    offset = writeFrameHeader(
        buffer, offset, bufferLength, 0x01, self.allocateId()
    );
    offset = writeInitBody(
        buffer, offset, self.relay.hostPort
    );

    self.writeToSocket(buffer);
};

RelayConnection.prototype.handleInitResponse =
function handleInitResponse() {
    var self = this;

    // magicCounters.out--;
    // console.log('handleInitResponse', magicCounters.out);

    self.flushPending();
};

RelayConnection.prototype.flushPending =
function flushPending() {
    var self = this;

    self.initialized = true;
    // console.log('flushing frames', self.frameQueue.length);

    for (var i = 0; i < self.frameQueue.length; i++) {
        self.writeToSocket(self.frameQueue[i]);
    }

    self.frameQueue.length = 0;
};

function onFrameBuffer(connection, buffer) {
    connection.onFrameBuffer(buffer);
}

function initFrameSize(hostPort) {
    // frameHeader:16 version:2 nh:2 hkl:2 hk:hkl hvl:2 hb:hvl
    var bufferLength =
        16 + // frameHeader:166
        2 + // version:2
        2 + // nh:2
        2 + 'host_port'.length + // hostPortKey
        2 + hostPort.length + // hostPortValue
        2 + 'process_name'.length + // processNameKey
        2 + process.title.length; // processNameValue

    return bufferLength;
}

function writeInitBody(buffer, offset, hostPort) {
    // Version
    buffer.writeUInt16BE(2, offset, true);
    offset += 2;
    // number of headers
    buffer.writeUInt16BE(2, offset, true);
    offset += 2;

    // key length
    buffer.writeUInt16BE('host_port'.length, offset, true);
    offset += 2;
    // key value
    buffer.write('host_port', offset, 'host_port'.length, 'utf8');
    offset += 'host_port'.length;

    // value length
    buffer.writeUInt16BE(hostPort.length, offset, true);
    offset += 2;
    // value value
    buffer.write(hostPort, offset, hostPort.length, 'utf8');
    offset += hostPort.length;

    // key length
    buffer.writeUInt16BE('process_name'.length, offset, true);
    offset += 2;
    // key value
    buffer.write('process_name', offset, 'process_name'.length, 'utf8');
    offset += 'process_name'.length;

    // value length
    buffer.writeUInt16BE(process.title.length, offset, true);
    offset += 2;
    // value value
    buffer.write(process.title, offset, process.title.length, 'utf8');
    offset += process.title.length;

    return offset;
}

function writeFrameHeader(buffer, offset, size, type, id) {
    // size
    buffer.writeUInt16BE(size, offset, true);
    offset += 2;

    // type
    buffer.writeInt8(type, offset, true);
    offset += 1;

    // reserved
    offset += 1;

    // id
    buffer.writeUInt32BE(id, offset, true);
    offset += 4;

    // reserved
    offset += 8;

    return offset;
}
