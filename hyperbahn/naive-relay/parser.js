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
