'use strict';

var net = require('net');
var console = require('console');

var RelayConnection = require('./connection.js');

module.exports = NaiveRelay;

function NaiveRelay(opts) {
    if (!(this instanceof NaiveRelay)) {
        return new NaiveRelay(opts);
    }

    var self = this;

    self.destinationPort = opts.destination;
    self.server = net.createServer(onSocket);

    self.outRequestMapping = Object.create(null);
    self.destConn = null;
    self.hostPort = null;

    self.requestCount = 0;

    function onSocket(socket) {
        self.onSocket(socket, 'in');
    }
}

NaiveRelay.prototype.onSocket = function onSocket(socket, direction) {
    var self = this;

    var conn = RelayConnection(socket, self, direction);
    conn.readStart();

    return conn;
};

NaiveRelay.prototype.listen = function listen(port) {
    var self = this;

    self.hostPort = '127.0.0.1:' + port;
    self.server.listen(port);
};

NaiveRelay.prototype.chooseConn = function chooseConn(frame) {
    var self = this;

    if (self.destConn) {
        return self.destConn;
    }

    var socket = net.createConnection(self.destinationPort);
    self.destConn = self.onSocket(socket, 'out');
    return self.destConn;
};

NaiveRelay.prototype.handleFrame = function handleFrame(frame) {
    var self = this;

    var frameType = frame.readFrameType();

    // console.error('got frame type', {
    //     type: frameType
    // });

    switch (frameType) {
        case 0x01:
            self.handleInitRequest(frame);
            break;

        case 0x02:
            self.handleInitResponse(frame);
            break;

        case 0x03:
            self.requestCount++;
            // console.log('pending requests', self.requestCount);

            self.forwardCallRequest(frame);
            break;

        case 0x04:
            self.requestCount--;
            // console.log('pending requests', self.requestCount);

            self.forwardCallResponse(frame);
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

    var frameKey = destConn.guid + String(outId);
    self.outRequestMapping[frameKey] = frame;

    destConn.writeFrame(frame);
};

NaiveRelay.prototype.forwardCallResponse =
function forwardCallResponse(frame) {
    var self = this;

    var frameId = frame.readId();

    var frameKey = frame.sourceConnection.guid + String(frameId);
    var reqFrame = self.outRequestMapping[frameKey];
    delete self.outRequestMapping[frameKey];

    if (!reqFrame) {
        console.error('unknown frame', {
            frameId: frame.oldId
        });
        return;
    }

    // console.log('forwardCallResponse', {
    //     id: reqFrame.oldId
    // });

    frame.writeId(reqFrame.oldId);

    reqFrame.sourceConnection.writeFrame(frame);
};

NaiveRelay.prototype.handleUnknownFrame =
function handleUnknownFrame(frame) {
    /* eslint no-console: 0*/
    console.error('unknown frame', frame);
    console.error('buf as string', frame.frameBuffer.toString());
};
