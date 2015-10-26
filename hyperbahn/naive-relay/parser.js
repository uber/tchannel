'use strict';

var Buffer = require('buffer').Buffer;
var assert = require('assert');

var SIZE_BYTE_LENGTH = 2;

module.exports = FrameParser;

function FrameParser(context, onFrameBuffer) {
    if (!(this instanceof FrameParser)) {
        return new FrameParser(context, onFrameBuffer);
    }

    var self = this;

    self.remainder = [];
    self.remainderLength = 0;
    self.frameLength = 0;

    self._context = context;
    self._onFrameBuffer = onFrameBuffer;
}

FrameParser.prototype.write =
function write(networkBuffer) {
    var self = this;

    var networkBufferLength = networkBuffer.length;
    if (networkBufferLength < SIZE_BYTE_LENGTH) {
        self._addRemainder(networkBuffer, 0, networkBufferLength);
        return;
    }

    var maximumBytesAvailable = self.remainderLength + networkBufferLength;
    if (self.frameLength === 0) {
        self._readInitialFrameLength(networkBuffer);
    }

    if (self.frameLength > maximumBytesAvailable) {
        self._addRemainder(networkBuffer, 0, networkBufferLength);
        return;
    }

    var startOfBuffer = 0;

    while (self.frameLength <= maximumBytesAvailable) {
        var amountToRead = self.frameLength - self.remainderLength;
        var endOfBuffer = startOfBuffer + amountToRead;

        self._pushFrameBuffer(networkBuffer, startOfBuffer, endOfBuffer);
        startOfBuffer = endOfBuffer;

        if (networkBufferLength - startOfBuffer < SIZE_BYTE_LENGTH) {
            break;
        }

        maximumBytesAvailable = networkBufferLength - startOfBuffer;
        self.frameLength = networkBuffer.readUInt16BE(startOfBuffer);
    }

    if (startOfBuffer < networkBufferLength) {
        self._addRemainder(networkBuffer, startOfBuffer, networkBufferLength);
    }
};

FrameParser.prototype._addRemainder =
function _addRemainder(networkBuffer, start, end) {
    var self = this;

    // Maybe allocate a new FastBuffer (cheap)
    var rawFrameBuffer = maybeSlice(networkBuffer, start, end);

    self.remainder.push(rawFrameBuffer);
    self.remainderLength += rawFrameBuffer.length;
};

FrameParser.prototype._pushFrameBuffer =
function _pushFrameBuffer(networkBuffer, start, end) {
    var self = this;

    var frameBuffer;
    if (self.remainderLength === 0) {
        // Maybe allocate a new FastBuffer (cheap)
        frameBuffer = maybeSlice(networkBuffer, start, end);
    } else {
        self._addRemainder(networkBuffer, start, end);

        // Allocate a new SlowBuffer (expensive)
        frameBuffer = Buffer.concat(self.remainder, self.remainderLength);

        self.remainder.length = 0;
        self.remainderLength = 0;
    }

    self._onFrameBuffer(self._context, frameBuffer);
    self.frameLength = 0;
};

FrameParser.prototype._readInitialFrameLength =
function _readInitialFrameLength(networkBuffer) {
    var self = this;

    if (self.remainderLength === 0) {
        self.frameLength = networkBuffer.readUInt16BE(0);
    } else if (self.remainderLength === 1) {
        self.frameLength = self.remainder[0][0] << 8 | networkBuffer[0];
    } else if (self.remainderLength >= 2) {
        var firstLen = self.remainder[0].length;
        if (firstLen === 1) {
            self.frameLength = self.remainder[0][0] << 8 | self.remainder[1][0];
        } else {
            self.frameLength = self.remainder[0].readUInt16BE(0);
        }
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
