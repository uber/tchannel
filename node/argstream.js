// Copyright (c) 2015 Uber Technologies, Inc.
//
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

/*
 * Provides federated streams for handling call arguments
 *
 * InArgStream is for handling incoming arg parts from call frames.  It handles
 * dispatching the arg chunks into .arg{1,2,3} streams.
 *
 * OutArgStream is for creating outgoing arg parts by writing to .arg{1,2,3}
 * streams.  It handles buffering as many parts as are written within one event
 * loop tick into an Array of arg chunks.  Such array is then flushed using
 * setImmediate.
 *
 * Due to the semantic complexity involved here, this code is tested by an
 * accompanying exhaistive search test in test/argstream.js.  This test has
 * both unit tests (disabled by default for speed) and an integration test.
 */

var inherits = require('util').inherits;
var EventEmitter = require('./lib/event_emitter');
var PassThrough = require('readable-stream').PassThrough;
var Ready = require('ready-signal');
var errors = require('./errors');

function ArgStream() {
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.frameEvent = self.defineEvent('frame');
    self.finishEvent = self.defineEvent('finish');

    self.arg1 = StreamArg();
    self.arg2 = StreamArg();
    self.arg3 = StreamArg();

    self.arg1.on('error', passError);
    self.arg2.on('error', passError);
    self.arg3.on('error', passError);
    function passError(err) {
        self.errorEvent.emit(self, err);
    }

    self.arg2.on('start', function onArg2Start() {
        if (!self.arg1._writableState.ended) self.arg1.end();
    });
    self.arg3.on('start', function onArg3Start() {
        if (!self.arg2._writableState.ended) self.arg2.end();
    });
}

inherits(ArgStream, EventEmitter);

function InArgStream() {
    if (!(this instanceof InArgStream)) {
        return new InArgStream();
    }
    var self = this;
    ArgStream.call(self);
    self.streams = [self.arg1, self.arg2, self.arg3];
    self._iStream = 0;
    self.finished = false;
    self._numFinished = 0;
    self.arg1.on('finish', argFinished);
    self.arg2.on('finish', argFinished);
    self.arg3.on('finish', argFinished);
    function argFinished() {
        if (++self._numFinished >= 3 && !self.finished) {
            self.finished = true;
            self.finishEvent.emit(self);
        }
    }
}

inherits(InArgStream, ArgStream);

InArgStream.prototype.handleFrame = function handleFrame(parts, isLast) {
    var self = this;
    var stream = self.streams[self._iStream];

    if (self.finished) {
        self.errorEvent.emit(self, new Error('arg stream finished')); // TODO typed error
    }

    for (var i = 0; i < parts.length; i++) {
        if (i > 0) stream = advance();
        if (!stream) break;
        if (parts[i].length) stream.write(parts[i]);
    }
    if (i < parts.length) {
        self.errorEvent.emit(self, new Error('frame parts exceeded stream arity')); // TODO clearer / typed error
    }

    if (isLast) {
        while (stream) stream = advance();
    }

    function advance() {
        if (self._iStream < self.streams.length) {
            self.streams[self._iStream].end();
            self._iStream++;
        }
        return self.streams[self._iStream];
    }
};

function OutArgStream() {
    if (!(this instanceof OutArgStream)) {
        return new OutArgStream();
    }
    var self = this;
    ArgStream.call(self);
    self._flushImmed = null;
    self.finished = false;
    self.frame = [Buffer(0)];
    self.currentArgN = 1;
    self.arg1.on('data', function onArg1Data(chunk) {
        self._handleFrameChunk(1, chunk);
    });
    self.arg2.on('data', function onArg2Data(chunk) {
        self._handleFrameChunk(2, chunk);
    });
    self.arg3.on('data', function onArg3Data(chunk) {
        self._handleFrameChunk(3, chunk);
    });

    self.arg1.on('finish', function onArg1Finish() {
        self._handleFrameChunk(1, null);
    });
    self.arg2.on('finish', function onArg2Finish() {
        self._handleFrameChunk(2, null);
    });
    self.arg3.on('finish', function onArg3Finish() {
        self._handleFrameChunk(3, null);
        self._flushParts(true);
        self.finished = true;
        self.finishEvent.emit(self);
    });
}

inherits(OutArgStream, ArgStream);

OutArgStream.prototype._handleFrameChunk = function _handleFrameChunk(n, chunk) {
    var self = this;
    if (n < self.currentArgN) {
        self.errorEvent.emit(self, errors.ArgChunkOutOfOrderError({
            current: self.currentArgN,
            got: n
        }));
    } else if (n > self.currentArgN) {
        if (n - self.currentArgN > 1) {
            self.errorEvent.emit(self, errors.ArgChunkGapError({
                current: self.currentArgN,
                got: n
            }));
        }
        self.currentArgN++;
        self.frame.push(chunk);
    } else if (chunk === null) {
        if (++self.currentArgN <= 3) {
            self.frame.push(Buffer(0));
        }
    } else {
        self._appendFrameChunk(chunk);
    }
    self._deferFlushParts();
};

OutArgStream.prototype._appendFrameChunk = function _appendFrameChunk(chunk) {
    var self = this;
    var i = self.frame.length - 1;
    var buf = self.frame[i];
    if (buf.length) {
        self.frame[i] = Buffer.concat([buf, chunk]);
    } else {
        self.frame[i] = chunk;
    }
};

OutArgStream.prototype._deferFlushParts = function _deferFlushParts() {
    var self = this;
    if (!self._flushImmed) {
        self._flushImmed = setImmediate(function() {
            self._flushParts();
        });
    }
};

OutArgStream.prototype._flushParts = function _flushParts(isLast) {
    var self = this;
    if (self._flushImmed) {
        clearImmediate(self._flushImmed);
        self._flushImmed = null;
    }
    if (self.finished) return;
    isLast = Boolean(isLast);
    var frame = self.frame;
    self.frame = [Buffer(0)];
    if (frame.length) self.frameEvent.emit(self, [frame, isLast]);
};

function StreamArg(options) {
    if (!(this instanceof StreamArg)) {
        return new StreamArg(options);
    }
    var self = this;
    PassThrough.call(self, options);
    self.started = false;
    self.onValueReady = self.onValueReady.bind(self);
    self.buf = null;
}
inherits(StreamArg, PassThrough);

StreamArg.prototype._write = function _write(chunk, encoding, callback) {
    var self = this;
    if (!self.started) {
        self.started = true;
        self.emit('start');
    }
    PassThrough.prototype._write.call(self, chunk, encoding, callback);
};

StreamArg.prototype.onValueReady = function onValueReady(callback) {
    var self = this;
    self.onValueReady = Ready();
    bufferStreamData(self, self.onValueReady.signal);
    self.onValueReady(callback);
};

function bufferStreamData(stream, callback) {
    var parts = [];
    stream.on('data', onData);
    stream.on('error', finish);
    stream.on('end', finish);
    function onData(chunk) {
        parts.push(chunk);
    }
    function finish(err) {
        stream.removeListener('data', onData);
        stream.removeListener('error', finish);
        stream.removeListener('end', finish);
        var buf = Buffer.concat(parts);
        stream.buf = buf;
        if (err === undefined) err = null;
        callback(err, buf);
    }
}

module.exports.InArgStream = InArgStream;
module.exports.OutArgStream = OutArgStream;
