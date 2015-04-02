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
var TypedError = require('error/typed');
var util = require('util');

var EndpointAlreadyDefinedError = TypedError({
    type: 'endpoint-already-defined',
    message: 'endpoint {endpoint} already defined on service {service}',
    service: null,
    endpoint: null,
    oldHandler: null,
    newHandler:  null
});

var InvalidHandlerError = TypedError({
    type: 'invalid-handler',
    message: 'invalid handler function'
});

function TChannelEndpointHandler(serviceName) {
    if (!(this instanceof TChannelEndpointHandler)) {
        return new TChannelEndpointHandler(serviceName);
    }
    var self = this;
    EventEmitter.call(self);
    self.serviceName = serviceName;
    self.endpoints = Object.create(null);
    self.type = 'tchannel.endpoint-handler';
}
inherits(TChannelEndpointHandler, EventEmitter);

TChannelEndpointHandler.prototype.register = function register(name, handler) {
    var self = this;
    if (self.endpoints[name] !== undefined) {
        throw EndpointAlreadyDefinedError({
            service: self.serviceName,
            endpoint: name,
            oldHandler: self.endpoints[name],
            newHandler: handler
        });
    }
    if (typeof handler !== 'function') {
        throw InvalidHandlerError();
    }
    self.endpoints[name] = handler;
    return handler;
};

TChannelEndpointHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    if (req.streamed) {
        req.arg1.onValueReady(function arg1Ready(err, arg1) {
            if (err) {
                // TODO: log error
                sendError('UnexpectedError', util.format(
                    'error accumulating arg1: %s: %s',
                    err.constructor.name, err.message));
            } else {
                handleArg1(arg1);
            }
        });
    } else {
        handleArg1(req.arg1);
    }

    function handleArg1(arg1) {
        var name = String(arg1);
        var handler = self.endpoints[name];
        self.emit('handle.endpoint', name, handler);
        if (!handler) {
            sendError('BadRequest', util.format(
                'no such endpoint service=%j endpoint=%j',
                req.service, name));
        } else if (handler.canStream) {
            handler(req, buildResponse);
        } else if (req.streamed) {
            parallel({
                arg2: req.arg2.onValueReady,
                arg3: req.arg3.onValueReady
            }, argsDone);
        } else {
            compatHandle(handler, req);
        }

        function argsDone(err, args) {
            if (err) {
                // TODO: log error
                sendError('UnexpectedError', util.format(
                    'error accumulating arg2/arg3: %s: %s',
                    err.constructor.name, err.message));
            } else {
                compatHandle(handler, args);
            }
        }

        function compatHandle(handler, args) {
            var res = buildResponse({streamed: false});
            handler(req, res, args.arg2, args.arg3);
        }
    }

    function sendError(code, mess) {
        var res = buildResponse({streamed: false});
        res.sendError(code, mess);
    }
};

module.exports = TChannelEndpointHandler;
