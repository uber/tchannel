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

var emptyBuffer = Buffer(0);

var States = Object.create(null);
States.Initial = 0;
States.Streaming = 1;
States.Done = 2;
States.Error = 3;

function TChannelIncomingRequest(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.logger = options.logger;
    self.random = options.random;
    self.timers = options.timers;

    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.service = options.service || '';
    self.remoteAddr = null;
    self.headers = options.headers || {};
    self.checksum = options.checksum || null;
    if (options.streamed) {
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
    } else {
        self.streamed = false;
        self._argstream = null;
        self.arg1 = emptyBuffer;
        self.arg2 = emptyBuffer;
        self.arg3 = emptyBuffer;
    }

    if (options.tracer) {
        self.span = options.tracer.setupNewSpan({
            spanid: self.tracing.spanid,
            traceid: self.tracing.traceid,
            parentid: self.tracing.parentid,
            flags: options.tracer.forceTrace? 1 : self.tracing.flags,
            hostPort: options.hostPort,
            serviceName: '', // the service in options.service is not what we want
            name: '' // fill this in later
        });

        // TODO: better annotations
        self.span.annotate('sr');
        options.tracer.setCurrentSpan(self.span);
    } else {
        self.span = null;
    }

    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
}

inherits(TChannelIncomingRequest, EventEmitter);

TChannelIncomingRequest.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    if (self.streamed) {
        self._argstream.handleFrame(parts);
    } else {
        if (!parts) return;
        if (parts.length !== 3 ||
                self.state !== States.Initial) throw new Error('not implemented');
        self.arg1 = parts[0] || emptyBuffer;
        self.arg2 = parts[1] || emptyBuffer;
        self.arg3 = parts[2] || emptyBuffer;

        if (self.span) {
            self.span.name = String(self.arg1);
        }
    }
};

TChannelIncomingRequest.prototype.finish = function finish() {
    var self = this;
    if (self.state === States.Done) {
        throw new Error('request already done'); // TODO: typed error
    } else {
        self.state = States.Done;
    }
};

TChannelIncomingRequest.States = States;

module.exports = TChannelIncomingRequest;
