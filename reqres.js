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

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var parallel = require('run-parallel');

var InArgStream = require('./argstream').InArgStream;
var OutArgStream = require('./argstream').OutArgStream;

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
            hostPort: options.hostPort,
            serviceName: options.serviceName, 
            name: undefined // fill this in later
        });

        // TODO: better annotations
        self.span.annotate('sr');
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

function TChannelIncomingResponse(id, options) {
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.span = options.span;
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
    self.on('finish', function onFinish() {
        self.state = States.Done;
        if (self.span) {
            self.emit('span');
        }
    });
}

inherits(TChannelIncomingResponse, EventEmitter);

TChannelIncomingResponse.prototype.handleFrame = function handleFrame(parts) {
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
    }
};

TChannelIncomingResponse.prototype.finish = function finish() {
    var self = this;
    if (self.state === States.Done) {
        throw new Error('response already done'); // TODO: typed error
    } else {
        self.state = States.Done;
    }
};

function TChannelOutgoingRequest(id, options) {
    options = options || {};
    if (!options.sendFrame) {
        throw new Error('missing sendFrame');
    }
    var self = this;
    EventEmitter.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.sendFrame = options.sendFrame;
    if (options.streamed) {
        self.streamed = true;
        self._argstream = OutArgStream();
        self.arg1 = self._argstream.arg1;
        self.arg2 = self._argstream.arg2;
        self.arg3 = self._argstream.arg3;
        self._argstream.on('error', function passError(err) {
            self.emit('error', err);
        });
        self._argstream.on('frame', function onFrame(parts, isLast) {
            self.sendParts(parts, isLast);
        });
        self._argstream.on('finish', function onFinish() {
            self.emit('finish');
        });
    } else {
        self.streamed = false;
        self._argstream = null;
        self.arg1 = null;
        self.arg2 = null;
        self.arg3 = null;
    }

    if (options.tracer) {
        // new span with new ids
        self.span = options.tracer.setupNewSpan({
            spanid: null,
            traceid: null,
            parentid: null,
            hostPort: options.hostPort,
            serviceName: options.serviceName, 
            name: '' // fill this in later
        });
    } else {
        self.span = null;
    }
}

inherits(TChannelOutgoingRequest, EventEmitter);

TChannelOutgoingRequest.prototype.sendParts = function sendParts(parts, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendCallRequestFrame(parts, isLast);
            break;
        case States.Streaming:
            self.sendCallRequestContFrame(parts, isLast);
            break;
        case States.Done:
            // TODO: could probably happen normally, like say if a
            // streaming request is canceled
            throw new Error('got frame in done state'); // TODO: typed error
        case States.Error:
            // TODO: log warn
            break;
    }
};

TChannelOutgoingRequest.prototype.sendCallRequestFrame = function sendCallRequestFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            if (self.span) {
                self.span.annotate('cs');
            }
            self.sendFrame.callRequest(args, isLast);
            if (isLast) self.state = States.Done;
            else self.state = States.Streaming;
            break;
        case States.Streaming:
            throw new Error('first request frame already sent'); // TODO: typed error
        case States.Done:
            throw new Error('request already done'); // TODO: typed error
    }
};

TChannelOutgoingRequest.prototype.sendCallRequestContFrame = function sendCallRequestContFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            throw new Error('first request frame not sent'); // TODO: typed error
        case States.Streaming:
            self.sendFrame.callRequestCont(args, isLast);
            if (isLast) self.state = States.Done;
            break;
        case States.Done:
            throw new Error('request already done'); // TODO: typed error
    }
};

TChannelOutgoingRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;

    if (self.span) {
        self.span.name = String(arg1);
    }
    if (callback) self.hookupCallback(callback);
    if (self.streamed) {
        self.arg1.end(arg1);
        self.arg2.end(arg2);
        self.arg3.end(arg3);
    } else {
        self.sendCallRequestFrame([
            arg1 ? Buffer(arg1) : emptyBuffer,
            arg2 ? Buffer(arg2) : emptyBuffer,
            arg3 ? Buffer(arg3) : emptyBuffer
        ], true);
        self.emit('finish');
    }
    return self;
};

TChannelOutgoingRequest.prototype.hookupStreamCallback = function hookupCallback(callback) {
    var self = this;
    var called = false;
    self.on('error', onError);
    self.on('response', onResponse);

    function onError(err) {
        if (called) return;
        called = true;
        callback(err, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        callback(null, self, res);
    }

    return self;
};

TChannelOutgoingRequest.prototype.hookupCallback = function hookupCallback(callback) {
    var self = this;
    if (callback.canStream) {
        return self.hookupStreamCallback(callback);
    }
    var called = false;

    self.on('error', onError);
    self.on('response', onResponse);

    function onError(err) {
        if (called) return;
        called = true;
        callback(err, null, null);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        if (!res.streamed) {
            callback(null, res, res.arg2, res.arg3);
            return;
        }
        parallel({
            arg2: res.arg2.onValueReady,
            arg3: res.arg3.onValueReady
        }, compatCall);
        function compatCall(err, args) {
            callback(err, res, args.arg2, args.arg3);
        }
    }

    return self;
};

function TChannelOutgoingResponse(id, options) {
    options = options || {};
    if (!options.sendFrame) {
        throw new Error('missing sendFrame');
    }
    var self = this;
    EventEmitter.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.tracing = options.tracing || null;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0;
    self.sendFrame = options.sendFrame;
    self.span = options.span || null;
    if (options.streamed) {
        self.streamed = true;
        self._argstream = OutArgStream();
        self.arg1 = self._argstream.arg1;
        self.arg2 = self._argstream.arg2;
        self.arg3 = self._argstream.arg3;
        self._argstream.on('error', function passError(err) {
            self.emit('error', err);
        });
        self._argstream.on('frame', function onFrame(parts, isLast) {
            self.sendParts(parts, isLast);
        });
        self._argstream.on('finish', function onFinish() {
            self.emit('finish');
        });
    } else {
        self.streamed = false;
        self._argstream = null;
        self.arg1 = null;
        self.arg2 = null;
        self.arg3 = null;
    }

    self.on('finish', function onOutgoingResFinish() {
        if (self.span) {
            self.emit('span', self.span);
        }
    });
}

inherits(TChannelOutgoingResponse, EventEmitter);

TChannelOutgoingResponse.prototype.sendParts = function sendParts(parts, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendCallResponseFrame(parts, isLast);
            break;
        case States.Streaming:
            self.sendCallResponseContFrame(parts, isLast);
            break;
        case States.Done:
            throw new Error('got frame in done state'); // TODO: typed error
        case States.Error:
            // TODO: log warn
            break;
    }
};

TChannelOutgoingResponse.prototype.sendCallResponseFrame = function sendCallResponseFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendFrame.callResponse(args, isLast);
            if (isLast) {
                if (self.span) {
                    self.span.annotate('ss');
                }
                self.state = States.Done;
            }
            else self.state = States.Streaming;
            break;
        case States.Streaming:
            throw new Error('first response frame already sent'); // TODO: typed error
        case States.Done:
        case States.Error:
            throw new Error('response already done'); // TODO: typed error
    }
};

TChannelOutgoingResponse.prototype.sendCallResponseContFrame = function sendCallResponseContFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            throw new Error('first response frame not sent'); // TODO: typed error
        case States.Streaming:
            self.sendFrame.callResponseCont(args, isLast);
            if (isLast) {
                if (self.span) {
                    self.span.annotate('ss');
                }
                self.state = States.Done;
            }
            break;
        case States.Done:
        case States.Error:
            throw new Error('response already done'); // TODO: typed error
    }
};

TChannelOutgoingResponse.prototype.sendError = function sendError(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        throw new Error('response already done'); // TODO: typed error
    } else {
        if (self.span) {
            self.span.annotate('ss');
        }
        self.state = States.Error;
        if (self.streamed) {
            // TODO: we could decide to flush any parts in a (first?) call res frame
            self._argstream.finished = true;
            self.arg1.end();
            self.arg2.end();
            self.arg3.end();
        }
        self.sendFrame.error(codeString, message);
    }
};

TChannelOutgoingResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        throw new Error('response already started'); // TODO typed error
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
    if (self.streamed) {
        self.arg1.end();
    }
};

TChannelOutgoingResponse.prototype.sendOk = function sendOk(res1, res2) {
    var self = this;
    self.setOk(true);
    self.send(res1, res2);
};

TChannelOutgoingResponse.prototype.sendNotOk = function sendNotOk(res1, res2) {
    var self = this;
    self.setOk(false);
    self.send(res1, res2);
};

TChannelOutgoingResponse.prototype.send = function send(res1, res2) {
    var self = this;
    if (self.streamed) {
        self.arg2.end(res1);
        self.arg3.end(res2);
    } else {
        self.sendCallResponseFrame([
            self.arg1 || emptyBuffer,
            res1 ? Buffer(res1) : emptyBuffer,
            res2 ? Buffer(res2) : emptyBuffer
        ], true);
        self.emit('finish');
    }
};

module.exports.States = States;
module.exports.IncomingRequest = TChannelIncomingRequest;
module.exports.IncomingResponse = TChannelIncomingResponse;
module.exports.OutgoingRequest = TChannelOutgoingRequest;
module.exports.OutgoingResponse = TChannelOutgoingResponse;
