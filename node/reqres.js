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

var emptyTracing = Buffer(25); // TODO: proper tracing object
var emptyBuffer = Buffer(0);

// TODO: provide streams for arg2/3

function TChannelIncomingRequest(id, options) {
    if (!(this instanceof TChannelIncomingRequest)) {
        return new TChannelIncomingRequest(id, options);
    }
    options = options || {};
    var self = this;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || emptyTracing;
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.name = options.name || '';
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
}

function TChannelIncomingResponse(id, options) {
    if (!(this instanceof TChannelIncomingResponse)) {
        return new TChannelIncomingResponse(id, options);
    }
    options = options || {};
    var self = this;
    self.id = id || 0;
    self.code = options.code || 0;
    self.arg1 = options.arg1 || emptyBuffer;
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
}

TChannelIncomingResponse.prototype.isOK = function isOK() {
    var self = this;
    return self.code === 0; // TODO: probably okay, but a bit jank
};

function TChannelOutgoingRequest(id, options, sendFrame) {
    if (!(this instanceof TChannelOutgoingRequest)) {
        return new TChannelOutgoingRequest(id, options, sendFrame);
    }
    options = options || {};
    var self = this;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || emptyTracing;
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.sendFrame = sendFrame;
}

TChannelOutgoingRequest.prototype.send = function send(arg1, arg2, arg3) {
    var self = this;
    self.sendFrame(arg1, arg2, arg3);
};

function TChannelOutgoingResponse(id, options, sendFrame) {
    if (!(this instanceof TChannelOutgoingResponse)) {
        return new TChannelOutgoingResponse(id, options, sendFrame);
    }
    options = options || {};
    var self = this;
    self.id = id || 0;
    self.code = options.code || 0;
    self.tracing = options.tracing || emptyTracing;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.name = options.name || '';
    self.arg2 = options.arg2 || emptyBuffer;
    self.arg3 = options.arg3 || emptyBuffer;
    self.sendFrame = sendFrame;
}

TChannelOutgoingResponse.prototype.send = function send(err, res1, res2) {
    var self = this;
    self.sendFrame(err, res1, res2);
};

module.exports.IncomingRequest = TChannelIncomingRequest;
module.exports.IncomingResponse = TChannelIncomingResponse;
module.exports.OutgoingRequest = TChannelOutgoingRequest;
module.exports.OutgoingResponse = TChannelOutgoingResponse;
