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
var util = require('util');
var errors = require('./errors');

function TChannelEndpointHandler(serviceName, advertise) {
    if (!(this instanceof TChannelEndpointHandler)) {
        return new TChannelEndpointHandler(serviceName, advertise);
    }
    var self = this;
    EventEmitter.call(self);
    self.serviceName = serviceName;
    self.endpoints = Object.create(null);
    self.advertise = advertise ? true : false;
}
inherits(TChannelEndpointHandler, EventEmitter);

TChannelEndpointHandler.prototype.type = 'tchannel.endpoint-handler';

TChannelEndpointHandler.prototype.register = function register(name, handler) {
    var self = this;
    if (typeof handler !== 'function') {
        throw errors.InvalidHandlerError();
    }
    self.endpoints[name] = handler;
    return handler;
};

TChannelEndpointHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    if (!req.streamed) {
        self.handleArg1(req, buildResponse, req.arg1);
    } else {
        self.waitForArg1(req, buildResponse);
    }
};

TChannelEndpointHandler.prototype.waitForArg1 = function waitForArg1(req, buildResponse) {
    var self = this;
    req.arg1.onValueReady(function arg1Ready(err, arg1) {
        if (err) {
            // TODO: log error
            var res = buildResponse({streamed: false});
            res.sendError('UnexpectedError', util.format(
                'error accumulating arg1: %s: %s',
                err.constructor.name, err.message));
        } else {
            self.handleArg1(req, buildResponse, arg1);
        }
    });
};

TChannelEndpointHandler.prototype.handleArg1 = function handleArg1(req, buildResponse, arg1) {
    var self = this;
    var name = String(arg1);
    var handler = self.endpoints[name];
    var res;
    self.emit('handle.endpoint', name, handler);
    if (!handler) {
        res = buildResponse({streamed: false});
        res.sendError('BadRequest', util.format(
            'no such endpoint service=%j endpoint=%j',
            req.service, name));
    } else if (handler.canStream) {
        handler(req, buildResponse);
    } else if (req.streamed) {
        self.bufferArg23(req, buildResponse, handler);
    } else {
        res = buildResponse({streamed: false});
        handler(req, res, req.arg2, req.arg3);
    }
};

TChannelEndpointHandler.prototype.bufferArg23 = function bufferArg23(req, buildResponse, handler) {
    parallel({
        arg2: req.arg2.onValueReady,
        arg3: req.arg3.onValueReady
    }, argsDone);
    function argsDone(err, args) {
        var res = buildResponse({streamed: false});
        if (err) {
            // TODO: log error
            res.sendError('UnexpectedError', util.format(
                'error accumulating arg2/arg3: %s: %s',
                err.constructor.name, err.message));
        } else {
            handler(req, res, args.arg2, args.arg3);
        }
    }
};

module.exports = TChannelEndpointHandler;
