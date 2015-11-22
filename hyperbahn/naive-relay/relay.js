'use strict';

var TCP_WRAP = process.binding('tcp_wrap').TCP;
var console = require('console');
var setTimeout = require('timers').setTimeout;
var Buffer = require('buffer').Buffer;
var assert = require('assert');

var SIZE_BYTE_LENGTH = 2;

var ID_OFFSET = 4;
var TYPE_OFFSET = 2;

LazyFrame.freeList = [];
for (var i = 0; i < 1000; i++) {
    LazyFrame.freeList.push(new LazyFrame());
}

LazyFrame.alloc = allocLazyFrame;
LazyFrame.free = freeLazyFrame;

var GUID = 1;

module.exports = NaiveRelay;

function NaiveRelay(opts) {
    if (!(this instanceof NaiveRelay)) {
        return new NaiveRelay(opts);
    }

    var self = this;

    self.destinations = opts.relays;
    self.server = new TCP_WRAP();

    self.connections = null;
    self.hostPort = null;

    self.requestCount = 0;
    self.successCount = 0;
}

NaiveRelay.prototype.printRPS = function printRPS() {
    var self = this;

    setTimeout(printTheRPS, 1000);

    function printTheRPS() {
        var rate = self.successCount;
        self.successCount = 0;

        console.log('RPS[relay]:', rate);

        setTimeout(printTheRPS, 1000);
    }
};

NaiveRelay.prototype.listen = function listen(port, host) {
    var self = this;

    self.server.owner = self;
    self.server.onconnection = onConnection;

    self.hostPort = host + ':' + port;
    var err = self.server.bind(host, port);
    if (err) {
        console.error('failed to bind() to address', err);
        return;
    }

    err = self.server.listen(511);
    if (err) {
        console.error('failed to listen()', err);
        return;
    }
};

function onConnection(socket) {
    if (!socket) {
        console.error('could not accept / incoming connect');
        return;
    }

    var naiveRelay = this.owner;
    naiveRelay.onSocket(socket, 'in');
}


NaiveRelay.prototype.onSocket = function onSocket(socket, direction, hostPort) {
    var self = this;

    var conn = RelayConnection(socket, self, direction);
    if (direction === 'in') {
        conn.accept();
    } else if (direction === 'out') {
        conn.connect(hostPort);
    } else {
        console.error('invalid direction', direction);
    }

    return conn;
};

NaiveRelay.prototype.chooseConn = function chooseConn(frame) {
    var self = this;

    if (self.connections) {
        var rand = Math.floor(Math.random() * self.connections.length);

        return self.connections[rand];
    }

    self.connections = [];
    var hostPorts = self.destinations.split(',');
    // console.log('talking to: ', hostPorts.length);

    for (var i = 0; i < hostPorts.length; i++) {
        var socket = new TCP_WRAP();

        var conn = self.onSocket(socket, 'out', hostPorts[i]);
        self.connections.push(conn);
    }

    return self.connections[0];
};

NaiveRelay.prototype.handleFrame = function handleFrame(frame) {
    var self = this;

    var frameType = frame.readFrameType();

    switch (frameType) {
        case 0x01:
            self.handleInitRequest(frame);
            LazyFrame.free(frame);
            break;

        case 0x02:
            self.handleInitResponse(frame);
            LazyFrame.free(frame);
            break;

        case 0x03:
            self.forwardCallRequest(frame);
            break;

        case 0x04:
            self.forwardCallResponse(frame);
            self.successCount++;
            break;

        default:
            self.handleUnknownFrame(frame);
            break;
    }
};

NaiveRelay.prototype.handleInitRequest =
function handleInitRequest(frame) {
    var conn = frame.sourceConnection;

    conn.handleInitRequest(frame);
};

NaiveRelay.prototype.handleInitResponse =
function handleInitResponse(frame) {
    var conn = frame.sourceConnection;

    conn.handleInitResponse(frame);
};

NaiveRelay.prototype.forwardCallRequest =
function forwardCallRequest(frame) {
    var self = this;

    // Read the id before we mutate it.
    frame.readId();

    var destConn = self.chooseConn(frame);

    var outId = destConn.allocateId();
    frame.writeId(outId);

    // var frameKey = destConn.guid + String(outId);
    destConn.outRequestMapping[outId] = frame;

    destConn.writeFrame(frame);
};

NaiveRelay.prototype.forwardCallResponse =
function forwardCallResponse(frame) {
    var frameId = frame.readId();

    var reqFrame = frame.sourceConnection.outRequestMapping[frameId];
    delete frame.sourceConnection.outRequestMapping[frameId];

    if (!reqFrame) {
        console.error('unknown frame to forward', frame.oldId);
        return;
    }

    frame.writeId(reqFrame.oldId);

    reqFrame.sourceConnection.writeFrame(frame);

    LazyFrame.free(frame);
    LazyFrame.free(reqFrame);
};

NaiveRelay.prototype.handleUnknownFrame =
function handleUnknownFrame(frame) {
    /* eslint no-console: 0*/
    console.error('unknown frame', frame);
    console.error('buf as string', frame.frameBuffer.toString());
};


function FrameParser(context, onFrameBuffer) {
    if (!(this instanceof FrameParser)) {
        return new FrameParser(context, onFrameBuffer);
    }

    var self = this;

    self.remainderBuffer = null;
    self.hasTempRemainderBuffer = false;
    self.remainderOffset = 0;

    self.frameLength = 0;

    self._context = context;
    self._onFrameBuffer = onFrameBuffer;
}

FrameParser.prototype.write =
function write(networkBuffer, start, end) {
    var self = this;
    // console.log('FrameParser.write()');

    var networkBufferLength = end - start;
    var endOfNetworkBuffer = end;
    assert(networkBufferLength > 0, 'Cannot write() empty buffer');

    var startOfBuffer = start;

    var maximumBytesAvailable = self.remainderOffset + networkBufferLength;
    if (maximumBytesAvailable < SIZE_BYTE_LENGTH) {
        self._addRemainder(networkBuffer, startOfBuffer, endOfNetworkBuffer);
        return;
    }

    if (self.frameLength === 0) {
        self._readInitialFrameLength(networkBuffer, startOfBuffer);
    }

    if (self.frameLength > maximumBytesAvailable) {
        self._addRemainder(networkBuffer, startOfBuffer, endOfNetworkBuffer);
        return;
    }

    while (self.frameLength <= maximumBytesAvailable) {
        // console.log('FrameParser() while loop', {
        //     frameLength: self.frameLength,
        //     maximumBytesAvailable: maximumBytesAvailable,
        //     startOfBuffer: startOfBuffer,
        //     networkBufferLength: networkBufferLength
        // });
        var amountToRead = self.frameLength - self.remainderOffset;
        var endOfBuffer = startOfBuffer + amountToRead;

        self._pushFrameBuffer(networkBuffer, startOfBuffer, endOfBuffer);
        startOfBuffer = endOfBuffer;

        if (endOfNetworkBuffer - startOfBuffer < SIZE_BYTE_LENGTH) {
            // console.log('FrameParser() break', {
            //     endOfNetworkBuffer: endOfNetworkBuffer,
            //     startOfBuffer: startOfBuffer
            // });
            break;
        }

        maximumBytesAvailable = endOfNetworkBuffer - startOfBuffer;
        self.frameLength = networkBuffer.readUInt16BE(startOfBuffer);
    }

    if (startOfBuffer < endOfNetworkBuffer) {
        self._addRemainder(networkBuffer, startOfBuffer, endOfNetworkBuffer);
    }
};

FrameParser.prototype._addRemainder =
function _addRemainder(networkBuffer, start, end) {
    var self = this;
    // console.log('FrameParser()._addRemainder');

    if (self.frameLength === 0) {
        // Maybe allocate a new FastBuffer (cheap)
        var rawFrameBuffer = maybeSlice(networkBuffer, start, end);

        assert(self.remainderBuffer === null,
            'Cannot assign remainderBuffer twice');
        self.remainderBuffer = rawFrameBuffer;
        self.remainderOffset = rawFrameBuffer.length;
        self.hasTempRemainderBuffer = true;
        return;
    }

    if (self.remainderBuffer === null || self.hasTempRemainderBuffer) {
        var oldRemainder = self.remainderBuffer;

        // Allocate a SlowBuffer (expensive)
        self.remainderBuffer = new Buffer(self.frameLength);
        self.hasTempRemainderBuffer = false;

        if (oldRemainder) {
            oldRemainder.copy(self.remainderBuffer, 0);
        }
    }

    networkBuffer.copy(self.remainderBuffer, self.remainderOffset, start, end);
    self.remainderOffset += (end - start);
};

FrameParser.prototype._pushFrameBuffer =
function _pushFrameBuffer(networkBuffer, start, end) {
    var self = this;

    var frameBuffer;
    if (self.remainderOffset === 0) {
        // Maybe allocate a new FastBuffer (cheap)
        frameBuffer = maybeSlice(networkBuffer, start, end);
    } else {
        self._addRemainder(networkBuffer, start, end);

        frameBuffer = self.remainderBuffer;

        self.remainderBuffer = null;
        self.hasTempRemainderBuffer = false;
        self.remainderOffset = 0;
    }

    // console.log('FrameParser._onFrameBuffer()');
    self._onFrameBuffer(self._context, frameBuffer);
    self.frameLength = 0;
};

FrameParser.prototype._readInitialFrameLength =
function _readInitialFrameLength(networkBuffer, start) {
    var self = this;

    if (self.remainderOffset === 0) {
        self.frameLength = networkBuffer.readUInt16BE(start);
    } else if (self.remainderOffset === 1) {
        self.frameLength = self.remainderBuffer[0] << 8 | networkBuffer[start];
    } else if (self.remainderOffset >= 2) {
        self.frameLength = self.remainderBuffer.readUInt16BE(0);
    }
};

function maybeSlice(buf, start, end) {
    var slice;
    if (start === 0 && end === buf.length) {
        slice = buf;
    } else {
        slice = buf.slice(start, end);
    }

    return slice;
}

function allocLazyFrame(sourceConnection, frameBuffer) {
    var frame;

    if (LazyFrame.freeList.length === 0) {
        frame = new LazyFrame();
    } else {
        frame = LazyFrame.freeList.pop();
    }

    frame.sourceConnection = sourceConnection;
    frame.frameBuffer = frameBuffer;

    return frame;
}

function freeLazyFrame(frame) {
    frame.sourceConnection = null;
    frame.frameBuffer = null;
    frame.oldId = null;
    frame.newId = null;
    frame.frameType = null;

    LazyFrame.freeList.push(frame);
}

function LazyFrame() {
    var self = this;

    self.sourceConnection = null;
    self.frameBuffer = null;

    self.oldId = null;
    self.newId = null;
    self.frameType = null;
}

LazyFrame.prototype.readId = function readId() {
    var self = this;

    if (self.oldId !== null) {
        return self.oldId;
    }

    self.oldId = self.frameBuffer.readUInt32BE(ID_OFFSET, true);
    return self.oldId;
};

LazyFrame.prototype.readFrameType = function readFrameType() {
    var self = this;

    if (self.frameType !== null) {
        return self.frameType;
    }

    self.frameType = self.frameBuffer.readUInt8(TYPE_OFFSET, true);
    return self.frameType;
};

LazyFrame.prototype.writeId = function writeId(newId) {
    var self = this;

    self.frameBuffer.writeUInt32BE(newId, ID_OFFSET, true);

    self.newId = newId;
    return self.newId;
};


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
