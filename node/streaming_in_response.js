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

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var InArgStream = require('./argstream').InArgStream;

var States = Object.create(null);
States.Initial = 0;
States.Streaming = 1;
States.Done = 2;
States.Error = 3;

function StreamingInResponse(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.state = States.Initial;
    self.remoteAddr = null;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.span = options.span || null;

    self.streamed = true;
    self._argstream = InArgStream();
    self.arg1 = self._argstream.arg1;
    self.arg2 = self._argstream.arg2;
    self.arg3 = self._argstream.arg3;
    self._argstream.on('error', function passError(err) {
        self.emit('error', err);
    });
    self._argstream.on('finish', function onFinish() {
        self.emit('finish');
    });

    self.start = self.timers.now();

    self.on('finish', self.onFinish);
}

inherits(StreamingInResponse, EventEmitter);

StreamingInResponse.prototype.type = 'tchannel.incoming-response';

StreamingInResponse.prototype.onFinish = function onFinish() {
    var self = this;
    self.state = States.Done;
    if (self.span) {
        self.emit('span');
    }
};

StreamingInResponse.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    self._argstream.handleFrame(parts);
};

StreamingInResponse.States = States;

module.exports = StreamingInResponse;
