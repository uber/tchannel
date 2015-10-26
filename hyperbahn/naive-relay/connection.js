'use strict';

var Buffer = require('buffer').Buffer;
var process = require('process');

var FrameParser = require('./parser.js');
var LazyFrame = require('./lazy-frame.js');

var GUID = 1;

// var magicCounters = {
//     out: 0,
//     in: 0
// };

module.exports = RelayConnection;

function RelayConnection(socket, relay, direction) {
    if (!(this instanceof RelayConnection)) {
        return new RelayConnection(socket, relay, direction);
    }

    var self = this;

    self.socket = socket;
    self.relay = relay;

    self.parser = new FrameParser();
    self.idCounter = 1;
    self.guid = String(GUID++) + '~';
    self.outRequestMapping = Object.create(null);

    self.initialized = false;
    self.frameQueue = [];
    self.direction = direction;
}

RelayConnection.prototype.readStart = function readStart() {
    var self = this;

    self.socket.on('readable', onReadable);

    if (self.direction === 'out') {
        self.sendInitRequest();
    }

    function onReadable() {
        self.onSocketReadable();
    }
};

RelayConnection.prototype.onSocketReadable =
function onSocketReadable() {
    var self = this;

    var chunk;

    /* eslint yoda: 0*/
    while (null !== (chunk = self.socket.read())) {
        self.onSocketBuffer(chunk);
    }
};

RelayConnection.prototype.onSocketBuffer =
function onSocketBuffer(socketBuffer) {
    var self = this;

    self.parser.write(socketBuffer);

    // console.log('draining parser');
    while (self.parser.hasFrameBuffers()) {
        var frameBuffer = self.parser.getFrameBuffer();
        var frame = LazyFrame.alloc(self, frameBuffer);
        self.relay.handleFrame(frame);
    }
    // console.log('parser drained');
};

RelayConnection.prototype.allocateId = function allocateId() {
    var self = this;

    return self.idCounter++;
};

RelayConnection.prototype.writeFrame = function writeFrame(frame) {
    var self = this;

    if (self.initialized) {
        self.socket.write(frame.frameBuffer);
    } else {
        self.frameQueue.push(frame.frameBuffer);
    }
};

RelayConnection.prototype.handleInitRequest =
function handleInitRequest(reqFrame) {
    var self = this;

    // magicCounters.in++;
    // console.log('handleInitRequest', magicCounters.in);

    reqFrame.readId();
    self.sendInitResponse(reqFrame);

    self.flushPending();
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

    self.socket.write(buffer);
};

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

    self.socket.write(buffer);
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

    for (var i = 0; i < self.frameQueue.length; i++) {
        self.socket.write(self.frameQueue[i]);
    }

    self.initialized = true;
    self.frameQueue.length = 0;
};

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
    buffer.writeUInt16BE(2, offset);
    offset += 2;
    // number of headers
    buffer.writeUInt16BE(2, offset);
    offset += 2;

    // key length
    buffer.writeUInt16BE('host_port'.length, offset);
    offset += 2;
    // key value
    buffer.write('host_port', offset, 'host_port'.length, 'utf8');
    offset += 'host_port'.length;

    // value length
    buffer.writeUInt16BE(hostPort.length, offset);
    offset += 2;
    // value value
    buffer.write(hostPort, offset, hostPort.length, 'utf8');
    offset += hostPort.length;

    // key length
    buffer.writeUInt16BE('process_name'.length, offset);
    offset += 2;
    // key value
    buffer.write('process_name', offset, 'process_name'.length, 'utf8');
    offset += 'process_name'.length;

    // value length
    buffer.writeUInt16BE(process.title.length, offset);
    offset += 2;
    // value value
    buffer.write(process.title, offset, process.title.length, 'utf8');
    offset += process.title.length;

    return offset;
}

function writeFrameHeader(buffer, offset, size, type, id) {
    // size
    buffer.writeUInt16BE(size, offset);
    offset += 2;

    // type
    buffer.writeInt8(type, offset);
    offset += 1;

    // reserved
    offset += 1;

    // id
    buffer.writeUInt32BE(id, offset);
    offset += 4;

    // reserved
    offset += 8;

    return offset;
}
