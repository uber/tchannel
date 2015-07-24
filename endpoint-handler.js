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

var EventEmitter = require('./lib/event_emitter');
var inherits = require('util').inherits;
var util = require('util');
var errors = require('./errors');
var coerceRequestHandler = require('./request-handler');

function TChannelEndpointHandler(serviceName) {
    if (!(this instanceof TChannelEndpointHandler)) {
        return new TChannelEndpointHandler(serviceName);
    }
    var self = this;
    EventEmitter.call(self);
    self.handleEndpointEvent = self.defineEvent('handleEndpoint');

    self.serviceName = serviceName;
    self.endpoints = Object.create(null);
}
inherits(TChannelEndpointHandler, EventEmitter);

TChannelEndpointHandler.prototype.type = 'tchannel.endpoint-handler';

TChannelEndpointHandler.prototype.register = function register(name, options, handler) {
    var self = this;
    if (typeof options === 'function') {
        handler = options;
        options = {};
    }
    if (typeof handler !== 'function') {
        throw errors.InvalidHandlerError();
    }
    if (options.streamed) handler.canStream = true;
    self.endpoints[name] = coerceRequestHandler(handler, self, options);
    return handler;
};

TChannelEndpointHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;

    var handler = self.endpoints[req.endpoint];
    self.handleEndpointEvent.emit(self, {
        name: req.endpoint,
        handler: handler
    });
    if (!handler) {
        buildResponse({streamed: false}).sendError('BadRequest', util.format(
            'no such endpoint service=%j endpoint=%j',
            req.serviceName, req.endpoint));
    } else {
        handler.handleRequest(req, buildResponse);
    }
};

TChannelEndpointHandler.prototype.withArg23 = function withArg23(req, buildResponse, handler) {
    req.withArg23(function gotArg23(err, arg2, arg3) {
        var res = buildResponse({streamed: false});
        if (err) {
            // TODO: log error
            res.sendError('UnexpectedError', util.format(
                'error accumulating arg2/arg3: %s: %s',
                err.constructor.name, err.message));
        } else {
            handler.handleRequest(req, res, arg2, arg3);
        }
    });
};

module.exports = TChannelEndpointHandler;
