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

var errors = require('./errors');
var InArgStream = require('./argstream').InArgStream;

var States = Object.create(null);
States.Initial = 0;
States.Streaming = 1;
States.Done = 2;
States.Error = 3;

function StreamingInRequest(id, options) {
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

    self.streamed = true;
    self._argstream = InArgStream();
    self.arg1 = self._argstream.arg1;
    self.arg2 = self._argstream.arg2;
    self.arg3 = self._argstream.arg3;
    self._argstream.on('error', passError);
    self._argstream.on('finish', onFinish);

    if (options.tracer) {
        self.span = options.tracer.setupNewSpan({
            spanid: self.tracing.spanid,
            traceid: self.tracing.traceid,
            parentid: self.tracing.parentid,
            flags: self.tracing.flags,
            hostPort: options.hostPort,
            serviceName: self.service,
            name: '' // fill this in later
        });

        // TODO: better annotations
        self.span.annotate('sr');
    } else {
        self.span = null;
    }

    self.start = self.timers.now();
    self.timedOut = false;
    self.res = null;

    self.on('finish', self.onFinish);

    function passError(err) {
        self.emit('error', err);
    }

    function onFinish() {
        self.emit('finish');
    }
}

inherits(StreamingInRequest, EventEmitter);

StreamingInRequest.prototype.type = 'tchannel.incoming-request';

StreamingInRequest.prototype.onFinish = function onFinish() {
    var self = this;
    self.state = States.Done;
};

StreamingInRequest.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    self._argstream.handleFrame(parts);
};

StreamingInRequest.prototype.checkTimeout = function checkTimeout() {
    var self = this;
    if (!self.timedOut) {
        var elapsed = self.timers.now() - self.start;
        if (elapsed > self.ttl) {
            self.timedOut = true;
            // TODO: send an error frame response?
            // TODO: emit error on self.res instead / in additon to?
            // TODO: should cancel any pending handler
            process.nextTick(function deferInReqTimeoutErrorEmit() {
                self.emit('error', errors.TimeoutError({
                    id: self.id,
                    start: self.start,
                    elapsed: elapsed,
                    timeout: self.ttl
                }));
            });
        }
    }
    return self.timedOut;
};

StreamingInRequest.States = States;

module.exports = StreamingInRequest;
