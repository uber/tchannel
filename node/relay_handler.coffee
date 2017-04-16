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

RelayRequest = (channel, inreq, buildRes) ->
    self = this
    EventEmitter.call self
    self.channel = channel
    self.inreq = inreq
    self.inres = null
    self.outres = null
    self.outreq = null
    self.buildRes = buildRes
    return

RelayHandler = (channel) ->
    self = this
    self.channel = channel
    self.reqs = {}
    return

'use strict'
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
errors = require('./errors')
inherits RelayRequest, EventEmitter

RelayRequest::createOutRequest = ->
    self = this

    onResponse = (res) ->
        self.onResponse res
        return

    onError = (err) ->
        self.onError err
        return

    if self.outreq
        self.channel.logger.warn 'relay request already started',
            remoteAddr: self.inreq.remoteAddr
            id: self.inreq.id
        return
    elapsed = self.channel.timers.now() - self.inreq.start
    self.outreq = self.channel.request(
        streamed: self.inreq.streamed
        ttl: self.inreq.ttl - elapsed
        service: self.inreq.service
        headers: self.inreq.headers
        retryFlags: self.inreq.retryFlags)
    self.outreq.on 'response', onResponse
    self.outreq.on 'error', onError
    if self.outreq.streamed
        # TODO: frame-at-a-time rather than re-streaming?
        self.inreq.arg1.pipe self.outreq.arg1
        self.inreq.arg2.pipe self.outreq.arg2
        self.inreq.arg3.pipe self.outreq.arg3
    else
        self.outreq.send self.inreq.arg1, self.inreq.arg2, self.inreq.arg3
    self.outreq

RelayRequest::createOutResponse = (options) ->
    self = this

    emitFinish = ->
        self.emit 'finish'
        return

    if self.outres
        self.channel.logger.warn 'relay request already responded',
            remoteAddr: self.inreq.remoteAddr
            id: self.inreq.id
        return
    self.outres = self.buildRes(options)
    self.outres.on 'finish', emitFinish
    self.outres

RelayRequest::onResponse = (res) ->
    self = this
    if self.inres
        self.channel.logger.warn 'relay request got more than one response callback',
            remoteAddr: res.remoteAddr
            id: res.id
        return
    self.inres = res
    if !self.createOutResponse(
            streamed: self.inres.streamed
            code: self.inres.code)
        return
    if self.outres.streamed
        self.outres.arg1.end()
        self.inres.arg2.pipe self.outres.arg2
        self.inres.arg3.pipe self.outres.arg3
    else
        self.outres.send self.inres.arg2, self.inres.arg3
    return

RelayRequest::onError = (err) ->
    self = this
    if !self.createOutResponse()
        return
    codeName = errors.classify(err)
    if codeName
        self.outres.sendError codeName, err.message
    else
        self.outres.sendError 'UnexpectedError', err.message
        self.channel.logger.error 'unexpected error while forwarding', error: err
    # TODO: stat in some cases, e.g. declined / peer not available
    return

RelayHandler::type = 'tchannel.relay-handler'

RelayHandler::handleRequest = (req, buildRes) ->
    self = this
    rereq = self.reqs[req.id]

    rereqFinished = ->
        delete self.reqs[req.id]
        return

    if rereq
        self.channel.logger.error 'relay request already exists for incoming request',
            inReqId: req.id
            priorInResId: rereq.inres and rereq.inres.id
            priorOutResId: rereq.outres and rereq.outres.id
            priorOutReqId: rereq.outreq and rereq.outreq.id
        buildRes().sendError 'UnexpectedError', 'request id exists in relay handler'
        return
    rereq = new RelayRequest(self.channel, req, buildRes)
    self.reqs[req.id] = rereq
    rereq.on 'finish', rereqFinished
    rereq.createOutRequest()
    return

module.exports = RelayHandler
