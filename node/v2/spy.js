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

var TypedError = require('error/typed');
var inherits = require('util').inherits;
var Transform = require('stream').Transform;
var hex = require('hexer');

var BrokenReaderStateError = TypedError({
    type: 'tchannel.broken-reader-state',
    message: 'reader in invalid state {state}',
    state: null
});

module.exports = ChunkSpy;

var States = {
    PendingLength: 0,
    Seeking: 1
};

function ChunkSpy(sink, options) {
    if (!(this instanceof ChunkSpy)) {
        return new ChunkSpy(sink, options);
    }
    options = options || {};
    Transform.call(this, options);
    var self = this;
    self.hex = hex.Transform(options);
    self.frameLengthSize = options.frameLengthSize || 2;
    self.buffer = Buffer(0);
    self.expecting = self.frameLengthSize;
    self.state = States.PendingLength;
    self.hex.pipe(sink);
    switch (self.frameLengthSize) {
        case 1:
            self._readLength = Buffer.prototype.readUInt8;
            break;
        case 2:
            self._readLength = Buffer.prototype.readUInt16BE;
            break;
        case 4:
            self._readLength = Buffer.prototype.readUInt32BE;
            break;
        default:
            throw new Error('unsupported frame length size');
    }
}

inherits(ChunkSpy, Transform);

ChunkSpy.prototype._transform = function _transform(chunk, encoding, callback) {
    var self = this;
    if (!callback) {
        callback = emitIt;
    }
    if (self.buffer.length) {
        self.buffer = Buffer.concat([self.buffer, chunk], self.buffer.length + chunk.length);
    } else {
        self.buffer = chunk;
    }
    while (self.buffer.length) {
        switch (self.state) {
            case States.PendingLength:
                if (self.buffer.length >= self.expecting) {
                    self.expecting = self._readLength.call(self.buffer, 0);
                    self.state = States.Seeking;
                    self.hex.reset();
                }
                break;
            case States.Seeking:
                if (self.buffer.length >= self.expecting) {
                    chunk = self.buffer.slice(0, self.expecting);
                    self.push(chunk);
                    self.hex.write(chunk);
                    self.buffer = self.buffer.slice(self.expecting);
                    self.expecting = self.frameLengthSize;
                    self.state = States.PendingLength;
                } else {
                    self.expecting -= self.buffer.length;
                    self.push(self.buffer);
                    self.hex.write(self.buffer);
                    self.buffer = Buffer(0);
                }
                break;
            default:
                callback(BrokenReaderStateError({state: self.state}));
                return;
        }
    }
    callback();

    function emitIt(err) {
        self.emit('error', err);
    }
};

ChunkSpy.prototype._flush = function _flush(callback) {
    var self = this;
    if (self.buffer.length) {
        self.push(self.buffer);
        self.hex.write(self.buffer);
        self.buffer = Buffer(0);
        self.expecting = 4;
        self.state = States.PendingLength;
    }
    callback();
};
