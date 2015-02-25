// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var errors = require('./errors');

module.exports = ChunkParser;

var States = {
    PendingLength: 0,
    Seeking: 1
};

function ChunkParser(FrameType, options) {
    if (!(this instanceof ChunkParser)) {
        return new ChunkParser(FrameType, options);
    }
    options = options || {};
    EventEmitter.call(this, options);
    var self = this;
    self.FrameType = FrameType;
    self.buffer = Buffer(0);
    self.frameLengthSize = options.frameLengthSize || 2;
    self.expecting = self.frameLengthSize;
    self.state = States.PendingLength;
    switch (self.frameLengthSize) {
        case 1:
            self._readLength = self._readUInt8Length;
            break;
        case 2:
            self._readLength = self._readUInt16BELength;
            break;
        case 4:
            self._readLength = self._readUInt32BELength;
            break;
        default:
            throw new Error('unsupported frame length size');
    }
}

inherits(ChunkParser, EventEmitter);

ChunkParser.prototype.execute = function execute(chunk) {
    var self = this;
    self.push(chunk);
    while (self.buffer.length >= self.expecting) {
        switch (self.state) {
            case States.PendingLength:
                self.expecting = self._readLength();
                self.state = States.Seeking;
                break;
            case States.Seeking:
                var frameChunk = self.shift();
                self.handleFrame(frameChunk);
                self.expecting = self.frameLengthSize;
                self.state = States.PendingLength;
                break;
            default:
                self.emit('error', errors.BrokenParserStateError({state: self.state}));
                return;
        }
    }
};

ChunkParser.prototype.handleFrame = function handleFrame(chunk) {
    var self = this;
    var res = self.FrameType.read(chunk, 0);
    var err = res[0];
    var end = res[1];
    var frame = res[2];
    if (!err && end < chunk.length) {
        // NOTE redundant with check in Frame.read
        err = errors.ShortChunkRead({remaining: chunk.length - end});
    }
    if (err) {
        err.offset = end;
        err.buffer = chunk;
        self.emit('error', err);
    } else {
        self.emit('frame', frame);
    }
};

ChunkParser.prototype.push = function push(chunk) {
    var self = this;
    if (self.buffer.length) {
        self.buffer = Buffer.concat([self.buffer, chunk], self.buffer.length + chunk.length);
    } else {
        self.buffer = chunk;
    }
};

ChunkParser.prototype.shift = function shift() {
    var self = this;
    var chunk;
    if (self.buffer.length < self.expecting) {
        chunk = Buffer(0);
    } else if (self.buffer.length > self.expecting) {
        chunk = self.buffer.slice(0, self.expecting);
        self.buffer = self.buffer.slice(self.expecting);
    } else {
        chunk = self.buffer;
        self.buffer = Buffer(0);
    }
    return chunk;
};

ChunkParser.prototype.flush = function flush() {
    var self = this;
    if (self.buffer.length) {
        self.emit('error', errors.TruncatedParseError({
            length: self.buffer.length,
            buffer: self.buffer,
            state: self.state,
            expecting: self.expecting
        }));
        self.buffer = Buffer(0);
        self.expecting = 4;
        self.state = States.PendingLength;
    }
};

ChunkParser.prototype._readUInt8Length = function _readUInt8Length() {
    var self = this;
    return self.buffer.readUInt8(0);
};

ChunkParser.prototype._readUInt16BELength = function _readUInt16BELength() {
    var self = this;
    return self.buffer.readUInt16BE(0);
};

ChunkParser.prototype._readUInt32BELength = function _readUInt32BELength() {
    var self = this;
    return self.buffer.readUInt32BE(0);
};
