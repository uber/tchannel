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

    if (!self.frameLength) {
        self.frameLength = readFrameSize(buffer, 0);
    }

    if (self.frameLength <= 16) {
        console.error('got really small frame', {
            frameLength: self.frameLength
        });
    }

    var totalBufferLength = buffer.length;
    var totalLength = self.remainderLength + totalBufferLength;

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

    var startOfBuffer = 0;

    while (self.frameLength <= totalLength) {
        var amountToRead = self.frameLength - self.remainderLength;

        var lastBuffer = buffer.slice(
            startOfBuffer, startOfBuffer + amountToRead
        );
        self.onFrameBuffer(self.concatRemainder(lastBuffer));
        self.frameLength = null;

        if (startOfBuffer + amountToRead === totalBufferLength) {
            return;
        }

        // buffer = buffer.slice(startOfBuffer + amountToRead, bufferLength);
        startOfBuffer = startOfBuffer + amountToRead;
        totalLength = totalBufferLength - (startOfBuffer);
        self.frameLength = readFrameSize(buffer, startOfBuffer);
    }

    if (startOfBuffer < totalBufferLength) {
        self.addRemainder(buffer.slice(
            startOfBuffer, totalBufferLength
        ));
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
