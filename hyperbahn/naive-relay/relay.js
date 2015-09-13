'use strict';

var net = require('net');
var console = require('console');
var setTimeout = require('timers').setTimeout;

var RelayConnection = require('./connection.js');

module.exports = NaiveRelay;

function NaiveRelay(opts) {
    if (!(this instanceof NaiveRelay)) {
        return new NaiveRelay(opts);
    }

    var self = this;

    self.destinations = opts.relays;
    self.server = net.createServer(onSocket);

    self.outRequestMapping = Object.create(null);
    self.connections = null;
    self.hostPort = null;

    self.requestCount = 0;
    self.successCount = 0;

    function onSocket(socket) {
        self.onSocket(socket, 'in');
    }
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

NaiveRelay.prototype.onSocket = function onSocket(socket, direction) {
    var self = this;

    var conn = RelayConnection(socket, self, direction);
    conn.readStart();

    return conn;
};

NaiveRelay.prototype.listen = function listen(port, host) {
    var self = this;

    self.hostPort = host + ':' + port;
    self.server.listen(port, host);
};

NaiveRelay.prototype.chooseConn = function chooseConn(frame) {
    var self = this;

    if (self.connections) {
        var rand = Math.floor(Math.random() * self.connections.length);

        return self.connections[rand];
    }

    self.connections = [];
    var hostPorts = self.destinations.split(',');

    for (var i = 0; i < hostPorts.length; i++) {
        var parts = hostPorts[i].split(':');
        var socket = net.createConnection(parts[1], parts[0]);
        var conn = self.onSocket(socket, 'out');
        self.connections.push(conn);
    }

    return self.connections[0];
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
            self.successCount++;
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
