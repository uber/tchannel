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

var IncomingRequest = require('./incoming_request');
var IncomingResponse = require('./incoming_response');
var OutgoingRequest = require('./outgoing_request');
var OutgoingResponse = require('./outgoing_response');

var inherits = require('util').inherits;

var v2 = require('./v2');

var TChannelConnectionBase = require('./connection_base');

function TChannelSelfConnection(channel) {
    if (!(this instanceof TChannelSelfConnection)) {
        return new TChannelSelfConnection(channel);
    }
    var self = this;
    TChannelConnectionBase.call(self, channel, 'in', channel.hostPort);
    self.idCount = 0;
}
inherits(TChannelSelfConnection, TChannelConnectionBase);

TChannelSelfConnection.prototype.buildOutgoingRequest = function buildOutgoingRequest(options) {
    var self = this;
    var id = self.idCount++;
    if (!options) options = {};
    options.sendFrame = {
        callRequest: passParts,
        callRequestCont: passParts
    };
    options.tracer = self.tracer;
    var outreq = new OutgoingRequest(id, options);

    if (outreq.span) {
        options.tracing = outreq.span.getTracing();
    }
    options.hostPort = self.channel.hostPort;

    var inreq = new IncomingRequest(id, options);
    var called = false;
    inreq.on('error', onError);
    inreq.on('response', onResponse);
    self.handleCallRequest(inreq);
    return outreq;

    function onError(err) {
        if (called) return;
        called = true;
        self.popOutOp(id);
        inreq.removeListener('response', onResponse);
        outreq.emit('error', err);
    }

    function onResponse(res) {
        if (called) return;
        called = true;
        self.popOutOp(id);
        inreq.removeListener('error', onError);
        outreq.emit('response', res);
    }

    function passParts(args, isLast ) {
        inreq.handleFrame(args);
        if (isLast) inreq.handleFrame(null);
        if (!self.closing) self.lastTimeoutTime = 0;
    }
};

TChannelSelfConnection.prototype.buildOutgoingResponse = function buildOutgoingResponse(req, options) {
    var self = this;
    if (!options) options = {};
    options.tracing = req.tracing;

    // options.checksum = new v2.Checksum(None);

    options.sendFrame = {
        callResponse: passParts,
        callResponseCont: passParts,
        error: passError
    };
    var outres = new OutgoingResponse(req.id, options);
    var inres = new IncomingResponse(req.id, options);
    var first = true;
    return outres;

    function passParts(args, isLast) {
        inres.handleFrame(args);
        if (isLast) inres.handleFrame(null);
        if (first) {
            inres.code = outres.code;
            inres.ok = outres.ok;
            first = false;
            req.emit('response', inres);
        }
        if (!self.closing) self.lastTimeoutTime = 0;
    }

    function passError(codeString, message) {
        var code = v2.ErrorResponse.Codes[codeString];
        var err = v2.ErrorResponse.CodeErrors[code]({
            originalId: req.id,
            message: message
        });
        req.emit('error', err);
        // TODO: should terminate corresponding inc res
        if (!self.closing) self.lastTimeoutTime = 0;
    }
};

module.exports = TChannelSelfConnection;
