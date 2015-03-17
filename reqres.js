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

var emptyTracing = require('./v2/tracing').emptyTracing;
var emptyBuffer = Buffer(0);

// TODO: provide streams for arg2/3

function TChannelIncomingRequest(id, options) {
    if (!(this instanceof TChannelIncomingRequest)) {
        return new TChannelIncomingRequest(id, options);
    }
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || emptyTracing;
    self.service = options.service || '';
    self.remoteAddr = null;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.arg1 = options.arg1 || emptyBuffer;
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
}

inherits(TChannelIncomingRequest, EventEmitter);

function TChannelIncomingResponse(id, options) {
    if (!(this instanceof TChannelIncomingResponse)) {
        return new TChannelIncomingResponse(id, options);
    }
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.id = id || 0;
    self.code = options.code || 0;
    self.arg1 = options.arg1 || emptyBuffer;
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
}

inherits(TChannelIncomingResponse, EventEmitter);

function TChannelOutgoingRequest(id, options, sendFrame) {
    if (!(this instanceof TChannelOutgoingRequest)) {
        return new TChannelOutgoingRequest(id, options, sendFrame);
    }
    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || emptyTracing;
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.sendFrame = sendFrame;
    self.sent = false;
}

inherits(TChannelOutgoingRequest, EventEmitter);

TChannelOutgoingRequest.prototype.send = function send(arg1, arg2, arg3, callback) {
    var self = this;
    if (callback) self.hookupCallback(callback);
    if (self.sent) {
        throw new Error('request already sent');
    }
    self.sent = true;
    self.sendFrame(
        arg1 ? Buffer(arg1) : null,
        arg2 ? Buffer(arg2) : null,
        arg3 ? Buffer(arg3) : null);
    self.emit('end');
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
        callback(null, res);
    }
    return self;
};

function TChannelOutgoingResponse(id, options, senders) {
    if (!(this instanceof TChannelOutgoingResponse)) {
        return new TChannelOutgoingResponse(id, options, senders);
    }

    options = options || {};
    var self = this;
    EventEmitter.call(self);
    self.id = id || 0;
    self.code = options.code || 0;
    self.tracing = options.tracing || emptyTracing;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.ok = true;
    self.arg1 = options.arg1 || emptyBuffer;
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
    self.sendCallResponseFrame = senders.callResponseFrame;
    self.sendErrorFrame = senders.errorFrame;
    self.sent = false;
}

inherits(TChannelOutgoingResponse, EventEmitter);

TChannelOutgoingResponse.prototype.sendOk = function send(res1, res2) {
    var self = this;
    if (self.sent) {
        throw new Error('response already sent');
    }

    self.sent = true;
    self.ok = true;

    self.sendCallResponseFrame(self.arg1,
        res1 ? Buffer(res1) : null,
        res2 ? Buffer(res2) : null);
    self.emit('end');
};

TChannelOutgoingResponse.prototype.sendNotOk = function sendNotOk(res1, res2) {
    var self = this;
    if (self.sent) {
        throw new Error('response already sent');
    }

    self.sent = true;
    self.ok = false;
    self.code = 1;

    self.sendCallResponseFrame(self.arg1,
        res1 ? Buffer(res1) : null,
        res2 ? Buffer(res2) : null);
    self.emit('end');
};

module.exports.IncomingRequest = TChannelIncomingRequest;
module.exports.IncomingResponse = TChannelIncomingResponse;
module.exports.OutgoingRequest = TChannelOutgoingRequest;
module.exports.OutgoingResponse = TChannelOutgoingResponse;
