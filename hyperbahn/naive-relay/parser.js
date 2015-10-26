'use strict';

var Buffer = require('buffer').Buffer;
var assert = require('assert');

module.exports = FrameParser;

function FrameParser() {
    if (!(this instanceof FrameParser)) {
        return new FrameParser();
    }

    var self = this;

    self.remainder = [];
    self.frameBuffers = [];
    self.remainderLength = 0;
    self.frameLength = 0;
}

FrameParser.prototype.write =
function write(networkBuffer) {
    var self = this;

    var totalBufferLength = networkBuffer.length;

    if (self.frameLength === 0) {
        self._readFrameLength(networkBuffer, 0);
    }

    var maximumBufferLength = self.remainderLength + totalBufferLength;

    if (self.frameLength === maximumBufferLength) {
        self._pushFrameBuffer(networkBuffer, 0, totalBufferLength);
        return;
    }

    if (self.frameLength > maximumBufferLength) {
        self._addRemainder(networkBuffer, 0, totalBufferLength);
        return;
    }

    var bufferOffset = 0;

    while (self.frameLength <= maximumBufferLength) {
        var amountToRead = self.frameLength - self.remainderLength;
        var endOfBuffer = bufferOffset + amountToRead;

        self._pushFrameBuffer(networkBuffer, bufferOffset, endOfBuffer);

        if (endOfBuffer === totalBufferLength) {
            return;
        }

        bufferOffset = endOfBuffer;
        maximumBufferLength = totalBufferLength - bufferOffset;
        self._readFrameLength(networkBuffer, bufferOffset);
    }

    if (bufferOffset < totalBufferLength) {
        self._addRemainder(networkBuffer, bufferOffset, totalBufferLength);
    }
};

FrameParser.prototype.hasFrameBuffers =
function hasFrameBuffers() {
    var self = this;

    return self.frameBuffers.length !== 0;
};

FrameParser.prototype.getFrameBuffer =
function getFrameBuffer() {
    var self = this;

    assert(self.frameBuffers.length > 0, 'frameBuffers must not be empty');

    var last = self.frameBuffers.pop();
    return last;
};

FrameParser.prototype._addRemainder =
function _addRemainder(networkBuffer, start, end) {
    var self = this;

    // Allocate a FastBuffer (cheap)
    var rawFrameBuffer = networkBuffer.slice(start, end);
    self.remainder.push(rawFrameBuffer);
    self.remainderLength += rawFrameBuffer.length;
};

FrameParser.prototype._concatRemainder =
function _concatRemainder(networkBuffer, start, end) {
    var self = this;
    var frameBuffer;

    if (self.remainderLength === 0) {
        if (start === 0 && end === networkBuffer.length) {
            return networkBuffer;
        }

        frameBuffer = networkBuffer.slice(start, end);
        return frameBuffer;
    }

    self._addRemainder(networkBuffer, start, end);

    frameBuffer = Buffer.concat(self.remainder, self.remainderLength);

    self.remainder.length = 0;
    self.remainderLength = 0;

    return frameBuffer;
};

FrameParser.prototype._pushFrameBuffer =
function _pushFrameBuffer(networkBuffer, start, end) {
    var self = this;

    var frameBuffer = self._concatRemainder(networkBuffer, start, end);

    self.frameBuffers.push(frameBuffer);
    self.frameLength = 0;
};

FrameParser.prototype._readFrameLength =
function _readFrameLength(networkBuffer, offset) {
    var self = this;

    self.frameLength = networkBuffer.readUInt16BE(offset);

    // Safety check
    if (self.frameLength <= 16) {
        console.error('Got unexpected really small frame', {
            frameLength: self.frameLength
        });
    }
};
