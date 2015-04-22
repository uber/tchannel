# Copyright (c) 2015 Uber Technologies, Inc.
#
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

TChannelSelfConnection = (channel) ->
    if !(this instanceof TChannelSelfConnection)
        return new TChannelSelfConnection(channel)
    self = this
    TChannelConnectionBase.call self, channel, 'in', channel.hostPort
    self.idCount = 0
    return

'use strict'
InRequest = require('./in_request')
InResponse = require('./in_response')
OutRequest = require('./out_request')
OutResponse = require('./out_response')
inherits = require('util').inherits
v2 = require('./v2')
TChannelConnectionBase = require('./connection_base')
inherits TChannelSelfConnection, TChannelConnectionBase

TChannelSelfConnection::buildOutRequest = (options) ->
    self = this
    id = self.idCount++

    handleRequest = ->
        inreq.headers = outreq.headers
        self.handleCallRequest inreq
        return

    onError = (err) ->
        if called
            return
        called = true
        self.popOutReq id
        inreq.removeListener 'response', onResponse
        outreq.emit 'error', err
        return

    onResponse = (res) ->
        if called
            return
        called = true
        self.popOutReq id
        inreq.removeListener 'error', onError
        outreq.emit 'response', res
        return

    passParts = (args, isLast) ->
        inreq.handleFrame args
        if isLast
            inreq.handleFrame null
        if !self.closing
            self.lastTimeoutTime = 0
        return

    if !options
        options = {}
    options.logger = self.logger
    options.random = self.random
    options.timers = self.timers
    options.sendFrame =
        callRequest: passParts
        callRequestCont: passParts
    options.tracer = self.tracer
    outreq = new OutRequest(id, options)
    if outreq.span
        options.tracing = outreq.span.getTracing()
    options.hostPort = self.channel.hostPort
    inreq = new InRequest(id, options)
    called = false
    inreq.on 'error', onError
    inreq.on 'response', onResponse
    inreq.outreq = outreq
    # TODO: make less hacky when have proper subclasses
    process.nextTick handleRequest
    outreq

TChannelSelfConnection::buildOutResponse = (inreq, options) ->
    self = this
    outreq = inreq.outreq

    passParts = (args, isLast) ->
        inres.handleFrame args
        if isLast
            inres.handleFrame null
        if first
            inres.code = outres.code
            inres.ok = outres.ok
            first = false
            inreq.emit 'response', inres
        if !self.closing
            self.lastTimeoutTime = 0
        return

    passError = (codeString, message) ->
        code = v2.ErrorResponse.Codes[codeString]
        err = v2.ErrorResponse.CodeErrors[code](
            originalId: inreq.id
            message: message)
        outreq.emit 'error', err
        if !self.closing
            self.lastTimeoutTime = 0
        return

    if !options
        options = {}
    options.logger = self.logger
    options.random = self.random
    options.timers = self.timers
    options.tracing = inreq.tracing
    # options.checksum = new v2.Checksum(None);
    options.sendFrame =
        callResponse: passParts
        callResponseCont: passParts
        error: passError
    outres = new OutResponse(inreq.id, options)
    inres = new InResponse(inreq.id, options)
    first = true
    outres

module.exports = TChannelSelfConnection
