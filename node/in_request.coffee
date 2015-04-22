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

TChannelInRequest = (id, options) ->
    options = options or {}
    self = this
    EventEmitter.call self
    self.logger = options.logger
    self.random = options.random
    self.timers = options.timers
    self.state = States.Initial
    self.id = id or 0
    self.ttl = options.ttl or 0
    self.tracing = options.tracing or null
    self.service = options.service or ''
    self.remoteAddr = null
    self.headers = options.headers or {}
    self.checksum = options.checksum or null
    if options.streamed
        self.streamed = true
        self._argstream = InArgStream()
        self.arg1 = self._argstream.arg1
        self.arg2 = self._argstream.arg2
        self.arg3 = self._argstream.arg3
        self._argstream.on 'error', (err) ->
            self.emit 'error', err
            return
        self._argstream.on 'finish', ->
            self.emit 'finish'
            return
    else
        self.streamed = false
        self._argstream = null
        self.arg1 = emptyBuffer
        self.arg2 = emptyBuffer
        self.arg3 = emptyBuffer
    if options.tracer
        self.span = options.tracer.setupNewSpan(
            spanid: self.tracing.spanid
            traceid: self.tracing.traceid
            parentid: self.tracing.parentid
            flags: self.tracing.flags
            hostPort: options.hostPort
            serviceName: self.service
            name: '')
        # TODO: better annotations
        self.span.annotate 'sr'
    else
        self.span = null
    self.start = self.timers.now()
    self.timedOut = false
    self.res = null
    self.on 'finish', self.onFinish
    return

'use strict'
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
errors = require('./errors')
InArgStream = require('./argstream').InArgStream
emptyBuffer = Buffer(0)
States = Object.create(null)
States.Initial = 0
States.Streaming = 1
States.Done = 2
States.Error = 3
inherits TChannelInRequest, EventEmitter
TChannelInRequest::type = 'tchannel.incoming-request'

TChannelInRequest::onFinish = ->
    self = this
    self.state = States.Done
    return

TChannelInRequest::handleFrame = (parts) ->
    self = this
    if self.streamed
        self._argstream.handleFrame parts
    else
        if !parts
            return
        if parts.length != 3 or self.state != States.Initial
            self.emit 'error', new Error('un-streamed argument defragmentation is not implemented')
        self.arg1 = parts[0] or emptyBuffer
        self.arg2 = parts[1] or emptyBuffer
        self.arg3 = parts[2] or emptyBuffer
        if self.span
            self.span.name = String(self.arg1)
        self.emit 'finish'
    return

TChannelInRequest::checkTimeout = ->
    self = this
    if !self.timedOut
        elapsed = self.timers.now() - self.start
        if elapsed > self.ttl
            self.timedOut = true
            # TODO: send an error frame response?
            # TODO: emit error on self.res instead / in additon to?
            # TODO: should cancel any pending handler
            process.nextTick ->
                self.emit 'error', errors.TimeoutError(
                    id: self.id
                    start: self.start
                    elapsed: elapsed
                    timeout: self.ttl)
                return
    self.timedOut

TChannelInRequest.States = States
module.exports = TChannelInRequest
