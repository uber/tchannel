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

    // If not parsing yet.
    if (self.remainder.length === 0) {
        // console.log('FrameParser scanStart');
        self.scanStart(buffer);
    } else {
        // console.log('FrameParser scanRest');
        self.scanRest(buffer);
    }
};

FrameParser.prototype.scanStart = function scanStart(buffer) {
    var self = this;

    self.frameLength = readFrameSize(buffer, 0);

    if (self.frameLength <= 16) {
        console.error('got really small frame', {
            frameLength: self.frameLength
        });
    }

    if (self.frameLength === buffer.length) {
        self.flush(buffer);
        return;
    }

    if (self.frameLength > buffer.length) {
        // console.log('addRemainder in scanStart', {
        //     bufferLength: buffer.length,
        //     frameLength: self.frameLength
        // });

        self.addRemainder(buffer);
        return;
    }

    while (self.frameLength <= buffer.length) {
        var len = self.frameLength;

        var frameBuffer = buffer.slice(0, len);
        self.flush(frameBuffer);

        if (len === buffer.length) {
            return;
        }

        buffer = buffer.slice(len, buffer.length);
        self.frameLength = readFrameSize(buffer, 0);
    }

    if (buffer.length) {
        self.addRemainder(buffer);
    }
};

FrameParser.prototype.scanRest = function scanRest(buffer) {
    var self = this;

    var totalLength = self.remainderLength + buffer.length;

    // console.log('scanRest', {
    //     totalLength: totalLength,
    //     frameLength: self.frameLength,
    //     remainderLength: self.remainderLength,
    //     bufferLength: buffer.length
    // });

    if (self.frameLength < totalLength) {
        var endOfBuffer = self.frameLength - self.remainderLength;

        var lastBuffer = buffer.slice(0, endOfBuffer);
        self.flush(self.concatRemainder(lastBuffer));

        var rest = buffer.slice(endOfBuffer, buffer.length);
        self.scanStart(rest);
    } else if (self.frameLength === totalLength) {
        self.flush(self.concatRemainder(buffer));
    } else if (self.frameLength > totalLength) {
        self.addRemainder(buffer);
    } else {
        throw new Error('not possible');
    }
};

FrameParser.prototype.flush = function flush(buffer) {
    var self = this;

    self.onFrameBuffer(buffer);
    self.frameLength = null;
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

    self.addRemainder(buffer);
    var buf = Buffer.concat(self.remainder, self.remainderLength);
    self.remainder.length = 0;
    self.remainderLength = 0;

    return buf;
};

function readFrameSize(buffer, offset) {
    return buffer.readUInt16BE(offset + 0);
}
