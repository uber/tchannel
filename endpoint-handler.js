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

var parallel = require('run-parallel');
var TypedError = require('error/typed');

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

var NoSuchEndpointError = TypedError({
    type: 'no-such-endpoint',
    message: 'no such endpoint {endpoint} on service {service}',
    service: null,
    endpoint: null
});

function TChannelEndpointHandler(serviceName) {
    if (!(this instanceof TChannelEndpointHandler)) {
        return new TChannelEndpointHandler(serviceName);
    }
    var self = this;
    self.serviceName = serviceName;
    self.endpoints = Object.create(null);
    self.type = null;
}

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

TChannelEndpointHandler.prototype.handleRequest = function handleRequest(req, res) {
    var self = this;
    // TODO: waterfall
    req.arg1.onValueReady(function arg1Ready(err, arg1) {
        if (err) throw err; // TODO: protocol error, respond with error frame
        var name = String(arg1);
        var handler = self.endpoints[name];
        if (!handler) {
            res.sendNotOk(null, NoSuchEndpointError({
                service: self.serviceName,
                endpoint: name
            }).message);
            return;
        }
        if (handler.canStream) {
            handler(req, res);
        } else {
            parallel({
                arg2: req.arg2.onValueReady,
                arg3: req.arg3.onValueReady
            }, function argsDone(err, args) {
                if (err) throw err; // TODO: protocol error, respond with error frame
                else handler(req, res, args.arg2, args.arg3);
            });
        }
    });
};

module.exports = TChannelEndpointHandler;
