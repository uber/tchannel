# Copyright (c) 2015 Uber Technologies, Inc.
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

TChannelEndpointHandler = (serviceName) ->
    if !(this instanceof TChannelEndpointHandler)
        return new TChannelEndpointHandler(serviceName)
    self = this
    EventEmitter.call self
    self.serviceName = serviceName
    self.endpoints = Object.create(null)
    return

'use strict'
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
parallel = require('run-parallel')
util = require('util')
errors = require('./errors')
inherits TChannelEndpointHandler, EventEmitter
TChannelEndpointHandler::type = 'tchannel.endpoint-handler'

TChannelEndpointHandler::register = (name, handler) ->
    self = this
    if typeof handler != 'function'
        throw errors.InvalidHandlerError()
    self.endpoints[name] = handler
    handler

TChannelEndpointHandler::handleRequest = (req, buildResponse) ->
    self = this
    if !req.streamed
        self.handleArg1 req, buildResponse, req.arg1
    else
        self.waitForArg1 req, buildResponse
    return

TChannelEndpointHandler::waitForArg1 = (req, buildResponse) ->
    self = this
    req.arg1.onValueReady (err, arg1) ->
        if err
            # TODO: log error
            res = buildResponse(streamed: false)
            res.sendError 'UnexpectedError', util.format('error accumulating arg1: %s: %s', err.constructor.name, err.message)
        else
            self.handleArg1 req, buildResponse, arg1
        return
    return

TChannelEndpointHandler::handleArg1 = (req, buildResponse, arg1) ->
    self = this
    name = String(arg1)
    handler = self.endpoints[name]
    res = undefined
    self.emit 'handle.endpoint', name, handler
    if !handler
        res = buildResponse(streamed: false)
        res.sendError 'BadRequest', util.format('no such endpoint service=%j endpoint=%j', req.service, name)
    else if handler.canStream
        handler.call self, req, buildResponse
    else if req.streamed
        self.bufferArg23 req, buildResponse, handler
    else
        res = buildResponse(streamed: false)
        handler.call self, req, res, req.arg2, req.arg3
    return

TChannelEndpointHandler::bufferArg23 = (req, buildResponse, handler) ->

    argsDone = (err, args) ->
        res = buildResponse(streamed: false)
        if err
            # TODO: log error
            res.sendError 'UnexpectedError', util.format('error accumulating arg2/arg3: %s: %s', err.constructor.name, err.message)
        else
            handler req, res, args.arg2, args.arg3
        return

    parallel {
        arg2: req.arg2.onValueReady
        arg3: req.arg3.onValueReady
    }, argsDone
    return

module.exports = TChannelEndpointHandler
