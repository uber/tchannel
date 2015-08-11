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

var errors = require('./errors.js');
var OutRequest = require('./self_out_request').OutRequest;
var OutResponse = require('./self_out_response').OutResponse;
var StreamingOutRequest = require('./self_out_request').StreamingOutRequest;
var StreamingOutResponse = require('./self_out_response').StreamingOutResponse;

var inherits = require('util').inherits;

var TChannelConnectionBase = require('./connection_base');

function TChannelSelfConnection(channel) {
    if (!(this instanceof TChannelSelfConnection)) {
        return new TChannelSelfConnection(channel);
    }
    var self = this;
    TChannelConnectionBase.call(self, channel, 'in', channel.hostPort);
    self.idCount = 1;

    // populate the remoteName as self
    self.remoteName = channel.hostPort;

    self.peer = channel.peers.getSelfPeer();
}
inherits(TChannelSelfConnection, TChannelConnectionBase);

TChannelSelfConnection.prototype.buildOutRequest = function buildOutRequest(options) {
    var self = this;
    var id = self.idCount++;

    options.peer = self.peer;
    options.hostPort = self.channel.hostPort;

    var outreq;
    if (options.streamed) {
        outreq = new StreamingOutRequest(self, id, options);
    } else {
        outreq = new OutRequest(self, id, options);
    }
    process.nextTick(handleRequest);
    return outreq;

    function handleRequest() {
        self.handleCallRequest(outreq.inreq);
    }
};

TChannelSelfConnection.prototype.handleCallRequest = function handleCallRequest(req) {
    var self = this;

    req.errorEvent.on(onReqError);
    TChannelConnectionBase.prototype.handleCallRequest.call(self, req);

    function onReqError(err) {
        self.onReqError(req, err);
    }
};

TChannelSelfConnection.prototype.onReqError = function onReqError(req, err) {
    var self = this;

    if (!req.res) self.buildResponse(req, {});

    var codeName = errors.classify(err);
    if (codeName) {
        req.res.sendError(codeName, err.message);
    } else {
        var errName = err.name || err.constructor.name;
        req.res.sendError('UnexpectedError', errName + ': ' + err.message);
    }
};

TChannelSelfConnection.prototype.buildOutResponse = function buildOutResponse(inreq, options) {
    var self = this;
    if (!options) options = {};
    options.logger = self.logger;
    options.random = self.random;
    options.timers = self.timers;
    options.tracing = inreq.tracing;
    if (options.streamed) {
        return new StreamingOutResponse(self, inreq, inreq.id, options);
    } else {
        return new OutResponse(self, inreq, inreq.id, options);
    }
};

TChannelSelfConnection.prototype.ping = function ping() {
    var self = this;
    var id = self.idCount++;
    // TODO: explicit type
    self.pingResponseEvent.emit(self, {id: id});
    return id;
};

TChannelSelfConnection.prototype.close = function close(callback) {
    var self = this;

    self.ops.destroy();

    callback();
};

module.exports = TChannelSelfConnection;
