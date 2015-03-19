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
var parallel = require('run-parallel');

var InArgStream = require('./argstream').InArgStream;
var OutArgStream = require('./argstream').OutArgStream;

var States = Object.create(null);
States.Initial = 0;
States.Streaming = 1;
States.Done = 2;
States.Error = 3;

function TChannelIncomingRequest(id, options) {
    if (!(this instanceof TChannelIncomingRequest)) {
        return new TChannelIncomingRequest(id, options);
    }
    options = options || {};
    var self = this;
    InArgStream.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.tracer = options.tracer;
    self.service = options.service || '';
    self.remoteAddr = null;
    self.headers = options.headers || {};
    self.checksum = options.checksum || null;
    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
}

inherits(TChannelIncomingRequest, InArgStream);

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
    InArgStream.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.checksum = options.checksum || null;
    self.ok = self.code === 0; // TODO: probably okay, but a bit jank
    self.on('finish', function onFinish() {
        self.state = States.Done;
    });
}

inherits(TChannelIncomingResponse, InArgStream);

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
    OutArgStream.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.ttl = options.ttl || 0;
    self.tracing = options.tracing || null;
    self.tracer = options.tracer; // tracing agent
    self.service = options.service || '';
    self.headers = options.headers || {};
    self.host = options.host;
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.sendFrame = options.sendFrame;
    self.on('frame', function onFrame(parts, isLast) {
        self.sendParts(parts, isLast);
    });
    self.on('finish', function onFinish() {
        // TODO: should be redundant with self.sendCallRequest(Cont)Frame
        // having been called with isLast=true
        self.state = States.Done;
    });
}

inherits(TChannelOutgoingRequest, OutArgStream);

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
    self.arg1.end(arg1);
    self.arg2.end(arg2);
    self.arg3.end(arg3);

    if (self.tracer) {
        // TODO: do in constructor and update here
        self.span = self.tracer.setupNewSpan({
            name: arg1
        });

        // TODO: better annotations
        self.span.annotate('cs');   // client start
    }
    return self;
};

TChannelOutgoingRequest.prototype.hookupCallback = function hookupCallback(callback) {
    var self = this;
    self.once('error', onError);
    self.once('response', onResponse);
    function onError(err) {
        // TODO: better annotations
        self.span.annotate('cr'); // client recv
        self.tracer.report(self.span);
        self.removeListener('response', onResponse);
        self.tracer.setCurrentSpan(self.span);
        callback(err, null);
    }
    function onResponse(res) {
        // TODO: better annotations
        self.span.annotate('cr');
        self.tracer.report(self.span);
        self.removeListener('error', onError);
        if (callback.canStream) {
            callback(null, res);
        } else {
            parallel({
                arg2: res.arg2.onValueReady,
                arg3: res.arg3.onValueReady
            }, function argsDone(err, args) {
                callback(err, res, args.arg2, args.arg3);
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
    OutArgStream.call(self);
    self.state = States.Initial;
    self.id = id || 0;
    self.code = options.code || 0;
    self.tracing = options.tracing || null;
    self.tracer = options.tracer;
    self.headers = options.headers || {};
    self.checksumType = options.checksumType || 0;
    self.checksum = options.checksum || null;
    self.ok = true;
    self.sendFrame = options.sendFrame;
    self.on('frame', function onFrame(parts, isLast) {
        self.sendParts(parts, isLast);
    });
    self.on('finish', function onFinish() {
        // TODO: should be redundant with self.sendCallResponse(Cont)Frame
        // having been called with isLast=true
        self.state = States.Done;
    });
}

inherits(TChannelOutgoingResponse, OutArgStream);

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

TChannelOutgoingResponse.prototype.sendError = function sendError(codeString, message) {
    var self = this;
    if (self.state === States.Done || self.state === States.Error) {
        throw new Error('response already done'); // TODO: typed error
    } else {
        // TODO: we could decide to flush any parts in a (first?) call res frame
        self.finished = true;
        self.state = States.Error;
        self.arg1.end();
        self.arg2.end();
        self.arg3.end();
        self.sendFrame.error(codeString, message);
    }

    self.sent = true;
    self.ok = true;

    if (self.tracer) {
        // TODO: better annotations
        self.span.annotate('ss', Date.now()); // server send
        self.tracer.report(self.span);
    }
};

TChannelOutgoingResponse.prototype.setOk = function setOk(ok) {
    var self = this;
    if (self.state !== States.Initial) {
        throw new Error('response already started'); // TODO typed error
    }
    self.ok = ok;
    self.code = ok ? 0 : 1; // TODO: too coupled to v2 specifics?
    self.arg1.end();
};

TChannelOutgoingResponse.prototype.sendOk = function sendOk(res1, res2) {
    var self = this;
    self.setOk(true);
    self.arg2.end(res1);
    self.arg3.end(res2);

    if (self.tracer) {
        // TODO: better annotations
        self.span.annotate('ss', Date.now()); // server send
        self.tracer.report(self.span);
    }
};

TChannelOutgoingResponse.prototype.sendNotOk = function sendNotOk(res1, res2) {
    var self = this;
    self.setOk(false);
    self.arg2.end(res1);
    self.arg3.end(res2);

    if (self.tracer) {
        // TODO: better annotations
        self.span.annotate('ss', Date.now()); // server send
        self.tracer.report(self.span);
    }
};

module.exports.States = States;
module.exports.IncomingRequest = TChannelIncomingRequest;
module.exports.IncomingResponse = TChannelIncomingResponse;
module.exports.OutgoingRequest = TChannelOutgoingRequest;
module.exports.OutgoingResponse = TChannelOutgoingResponse;
