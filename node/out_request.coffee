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

TChannelOutRequest = (id, options) ->
    options = options or {}
    assert options.sendFrame, 'required option sendFrame'
    self = this
    EventEmitter.call self
    self.logger = options.logger
    self.random = options.random
    self.timers = options.timers
    self.start = 0
    self.end = 0
    self.remoteAddr = options.remoteAddr
    self.state = States.Initial
    self.id = id or 0
    self.ttl = options.ttl or 0
    self.tracing = options.tracing or null
    self.service = options.service or ''
    self.headers = options.headers or {}
    self.checksumType = options.checksumType or 0
    self.checksum = options.checksum or null
    self.sendFrame = options.sendFrame
    if options.streamed
        self.streamed = true
        self._argstream = OutArgStream()
        self.arg1 = self._argstream.arg1
        self.arg2 = self._argstream.arg2
        self.arg3 = self._argstream.arg3
        self._argstream.on 'error', (err) ->
            self.emit 'error', err
            return
        self._argstream.on 'frame', (parts, isLast) ->
            self.sendParts parts, isLast
            return
        self._argstream.on 'finish', ->
            self.emit 'finish'
            return
    else
        self.streamed = false
        self._argstream = null
        self.arg1 = null
        self.arg2 = null
        self.arg3 = null
    if options.tracer
        # new span with new ids
        self.span = options.tracer.setupNewSpan(
            outgoing: true
            parentSpan: options.parentSpan
            topLevelRequest: options.topLevelRequest
            spanid: null
            traceid: null
            parentid: null
            flags: if options.trace then 1 else 0
            hostPort: self.remoteAddr
            serviceName: self.service
            name: '')
        self.tracing = self.span.getTracing()
    else
        self.span = null
    self.err = null
    self.res = null
    self.timedOut = false
    self.on 'error', self.onError
    self.on 'response', self.onResponse
    return

'use strict'
assert = require('assert')
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
parallel = require('run-parallel')
errors = require('./errors')
OutArgStream = require('./argstream').OutArgStream
States = Object.create(null)
States.Initial = 0
States.Streaming = 1
States.Done = 2
States.Error = 3
inherits TChannelOutRequest, EventEmitter
TChannelOutRequest::type = 'tchannel.outgoing-request'

TChannelOutRequest::onError = (err) ->
    self = this
    if !self.end
        self.end = self.timers.now()
    self.err = err
    return

TChannelOutRequest::onResponse = (res) ->
    self = this
    if !self.end
        self.end = self.timers.now()
    self.res = res
    self.res.span = self.span
    return

TChannelOutRequest::sendParts = (parts, isLast) ->
    self = this
    switch self.state
        when States.Initial
            self.sendCallRequestFrame parts, isLast
        when States.Streaming
            self.sendCallRequestContFrame parts, isLast
        when States.Done
            # TODO: could probably happen normally, like say if a
            # streaming request is canceled
            self.emit 'error', errors.RequestFrameState(
                attempted: 'arg parts'
                state: 'Done')
        when States.Error
            # TODO: log warn
    return

TChannelOutRequest::sendCallRequestFrame = (args, isLast) ->
    self = this
    switch self.state
        when States.Initial
            self.start = self.timers.now()
            if self.span
                self.span.annotate 'cs'
            self.sendFrame.callRequest args, isLast
            if isLast
                self.state = States.Done
            else
                self.state = States.Streaming
        when States.Streaming
            self.emit 'error', errors.RequestFrameState(
                attempted: 'call request'
                state: 'Streaming')
        when States.Done
            self.emit 'error', errors.RequestAlreadyDone(attempted: 'call request')
    return

TChannelOutRequest::sendCallRequestContFrame = (args, isLast) ->
    self = this
    switch self.state
        when States.Initial
            self.emit 'error', errors.RequestFrameState(
                attempted: 'call request continuation'
                state: 'Initial')
        when States.Streaming
            self.sendFrame.callRequestCont args, isLast
            if isLast
                self.state = States.Done
        when States.Done
            self.emit 'error', errors.RequestAlreadyDone(attempted: 'call request continuation')
    return

TChannelOutRequest::send = (arg1, arg2, arg3, callback) ->
    self = this
    if self.span
        self.span.name = String(arg1)
    if callback
        self.hookupCallback callback
    if self.streamed
        self.arg1.end arg1
        self.arg2.end arg2
        self.arg3.end arg3
    else
        self.sendCallRequestFrame [
            arg1
            arg2
            arg3
        ], true
        self.emit 'finish'
    self

TChannelOutRequest::hookupStreamCallback = (callback) ->
    self = this
    called = false

    onError = (err) ->
        if called
            return
        called = true
        callback err, null, null
        return

    onResponse = (res) ->
        if called
            return
        called = true
        callback null, self, res
        return

    self.on 'error', onError
    self.on 'response', onResponse
    self

TChannelOutRequest::hookupCallback = (callback) ->
    self = this

    onError = (err) ->
        if called
            return
        called = true
        callback err, null, null
        return

    onResponse = (res) ->

        compatCall = (err, args) ->
            callback err, res, args.arg2, args.arg3
            return

        if called
            return
        called = true
        if !res.streamed
            callback null, res, res.arg2, res.arg3
            return
        parallel {
            arg2: res.arg2.onValueReady
            arg3: res.arg3.onValueReady
        }, compatCall
        return

    if callback.canStream
        return self.hookupStreamCallback(callback)
    called = false
    self.on 'error', onError
    self.on 'response', onResponse
    self

TChannelOutRequest::checkTimeout = ->
    self = this
    if !self.timedOut
        now = self.timers.now()
        elapsed = now - self.start
        if elapsed > self.ttl
            self.end = now
            self.timedOut = true
            process.nextTick ->
                self.emit 'error', errors.TimeoutError(
                    id: self.id
                    start: self.start
                    elapsed: elapsed
                    timeout: self.ttl)
                return
    self.timedOut

TChannelOutRequest.States = States
module.exports = TChannelOutRequest
