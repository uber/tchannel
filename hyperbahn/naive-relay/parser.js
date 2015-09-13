'use strict';

var Buffer = require('buffer').Buffer;

module.exports = FrameParser;

function FrameParser(connection) {
    if (!(this instanceof FrameParser)) {
        return new FrameParser(connection);
    }

    var self = this;

    self.onFrameBuffer = null;

    self.remainder = [];
    self.remainderLength = 0;
    self.frameLength = null;
}

FrameParser.prototype.write = function write(buffer) {
    var self = this;

    self.scanStart(buffer);
};

FrameParser.prototype.scanStart = function scanStart(buffer) {
    var self = this;

    if (!self.frameLength) {
        self.frameLength = readFrameSize(buffer, 0);
    }

    if (self.frameLength <= 16) {
        console.error('got really small frame', {
            frameLength: self.frameLength
        });
    }

    var totalLength = self.remainderLength + buffer.length;

    if (self.frameLength === totalLength) {
        self.onFrameBuffer(self.concatRemainder(buffer));
        self.frameLength = null;
        return;
    }

    if (self.frameLength > totalLength) {
        // console.log('addRemainder in scanStart', {
        //     bufferLength: totalLength,
        //     frameLength: self.frameLength
        // });

        self.addRemainder(buffer);
        return;
    }

    while (self.frameLength <= totalLength) {
        var endOfBuffer = self.frameLength - self.remainderLength;

        var lastBuffer = buffer.slice(0, endOfBuffer);
        self.onFrameBuffer(self.concatRemainder(lastBuffer));
        self.frameLength = null;

        if (endOfBuffer === buffer.length) {
            return;
        }

        buffer = buffer.slice(endOfBuffer, buffer.length);
        totalLength = buffer.length;
        self.frameLength = readFrameSize(buffer, 0);
    }

    if (buffer.length) {
        self.addRemainder(buffer);
    }
};

FrameParser.prototype.addRemainder =
function addRemainder(buffer) {
    var self = this;

    self.remainder.push(buffer);
    self.remainderLength += buffer.length;
};

FrameParser.prototype.concatRemainder =
function concatRemainder(buffer) {
    var self = this;

    if (self.remainder.length === 0) {
        return buffer;
    }

    self.addRemainder(buffer);
    var buf = Buffer.concat(self.remainder, self.remainderLength);
    self.remainder.length = 0;
    self.remainderLength = 0;

    return buf;
};

function readFrameSize(buffer, offset) {
    return buffer.readUInt16BE(offset + 0);
}
