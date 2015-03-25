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

var emptyBuffer = Buffer(0);

var States = Object.create(null);
States.Initial = 0;
States.Streaming = 1;
States.Done = 2;
States.Error = 3;

// TODO: provide streams for arg2/3

function TChannelIncomingRequest(id, options) {
    if (!(this instanceof TChannelIncomingRequest)) {
        return new TChannelIncomingRequest(id, options);
    }
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
    self.checksumType = options.checksumType || 0;
    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
}

inherits(TChannelIncomingRequest, EventEmitter);

TChannelIncomingRequest.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    self.arg1 = parts[0] || emptyBuffer;
    self.arg2 = parts[1] || emptyBuffer;
    self.arg3 = parts[2] || emptyBuffer;
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
    if (!(this instanceof TChannelIncomingResponse)) {
        return new TChannelIncomingResponse(id, options);
    }
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
}

inherits(TChannelIncomingResponse, EventEmitter);

TChannelIncomingResponse.prototype.handleFrame = function handleFrame(parts) {
    var self = this;
    self.arg1 = parts[0] || emptyBuffer;
    self.arg2 = parts[1] || emptyBuffer;
    self.arg3 = parts[2] || emptyBuffer;
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
    if (!(this instanceof TChannelOutgoingRequest)) {
        return new TChannelOutgoingRequest(id, options);
    }
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
    self.on('frame', function onFrame(parts, isLast) {
        self.sendParts(parts, isLast);
    });
    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
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
    }
};

TChannelOutgoingRequest.prototype.sendCallRequestFrame = function sendCallRequestFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
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
    if (callback) self.hookupCallback(callback);
    if (self.state !== States.Initial) {
        throw new Error('request already sent');
    }
    self.sendCallRequestFrame([
        arg1 ? Buffer(arg1) : null,
        arg2 ? Buffer(arg2) : null,
        arg3 ? Buffer(arg3) : null
    ], true);
    self.emit('finish');
    return self;
};

TChannelOutgoingRequest.prototype.hookupCallback = function hookupCallback(callback) {
    var self = this;
    self.once('error', onError);
    self.once('response', onResponse);
    function onError(err) {
        self.removeListener('response', onResponse);
        callback(err, null);
    }
    function onResponse(res) {
        self.removeListener('error', onError);
        if (callback.canStream) {
            callback(null, res);
        } else {
            process.nextTick(function() {
                callback(null, res);
            });
        }
    }
    return self;
};

function TChannelOutgoingResponse(id, options) {
    if (!(this instanceof TChannelOutgoingResponse)) {
        return new TChannelOutgoingResponse(id, options);
    }
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
    self.ok = true;
    self.sendFrame = options.sendFrame;
    self.arg1 = options.arg1 || emptyBuffer;
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
    self.on('frame', function onFrame(parts, isLast) {
        self.sendParts(parts, isLast);
    });
    self.on('finish', function onFinish() {
        self.state = States.Done;
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
            // skip
            break;
    }
};

TChannelOutgoingResponse.prototype.sendCallResponseFrame = function sendCallResponseFrame(args, isLast) {
    var self = this;
    switch (self.state) {
        case States.Initial:
            self.sendFrame.callResponse(args, isLast);
            if (isLast) self.state = States.Done;
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
            if (isLast) self.state = States.Done;
            break;
        case States.Done:
        case States.Error:
            throw new Error('response already done'); // TODO: typed error
    }
};

TChannelOutgoingResponse.prototype.sendErrorFrame = function sendErrorFrame(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        throw new Error('response already done'); // TODO: typed error
    } else {
        self.sendFrame.error(codeString, message);
        self.state = States.Error;
    }
};

TChannelOutgoingResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        throw new Error('response already started'); // TODO typed error
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
};

TChannelOutgoingResponse.prototype.sendOk = function sendOk(res1, res2) {
    var self = this;
    self.setOk(true);
    self.sendCallResponseFrame([
        self.arg1,
        res1 ? Buffer(res1) : null,
        res2 ? Buffer(res2) : null
    ], true);
    self.emit('finish');
};

TChannelOutgoingResponse.prototype.sendNotOk = function sendNotOk(res1, res2) {
    var self = this;
    self.setOk(false);
    self.sendCallResponseFrame([
        self.arg1,
        res1 ? Buffer(res1) : null,
        res2 ? Buffer(res2) : null
    ], true);
    self.emit('finish');
};

module.exports.States = States;
module.exports.IncomingRequest = TChannelIncomingRequest;
module.exports.IncomingResponse = TChannelIncomingResponse;
module.exports.OutgoingRequest = TChannelOutgoingRequest;
module.exports.OutgoingResponse = TChannelOutgoingResponse;
