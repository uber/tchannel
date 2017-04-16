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

TChannelRequest = (channel, options) ->
    options = options or {}
    assert !options.streamed, 'streaming request federation not implemented'
    self = this
    EventEmitter.call self
    self.channel = channel
    self.logger = self.channel.logger
    self.random = self.channel.random
    self.timers = self.channel.timers
    self.options = options
    if !self.options.retryFlags
        self.options.retryFlags =
            never: false
            onConnectionError: true
            onTimeout: false
    self.triedRemoteAddrs = {}
    self.outReqs = []
    self.timeout = self.options.timeout or TChannelRequest.defaultTimeout
    self.limit = self.options.retryLimit or TChannelRequest.defaultRetryLimit
    self.start = 0
    self.end = 0
    self.elapsed = 0
    self.resendSanity = 0
    self.service = options.service or ''
    self.headers = self.options.headers or {}
    # so that as-foo can punch req.headers.X
    self.options.headers = self.headers
    # for passing to peer.request(opts) later
    self.arg1 = null
    self.arg2 = null
    self.arg3 = null
    self.err = null
    self.res = null
    self.on 'error', self.onError
    self.on 'response', self.onResponse
    return

withArg23 = (res, callback) ->

    compatCall = (err, args) ->
        callback err, res, args.arg2, args.arg3
        return

    if !res.streamed
        callback null, res, res.arg2, res.arg3
        return
    parallel {
        arg2: res.arg2.onValueReady
        arg3: res.arg3.onValueReady
    }, compatCall
    return

'use strict'
assert = require('assert')
parallel = require('run-parallel')
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
errors = require('./errors')
inherits TChannelRequest, EventEmitter
TChannelRequest.defaultRetryLimit = 5
TChannelRequest.defaultTimeout = 5000
TChannelRequest::type = 'tchannel.request'

TChannelRequest::onError = (err) ->
    self = this
    if !self.end
        self.end = self.timers.now()
    self.err = err
    return

TChannelRequest::onResponse = (res) ->
    self = this
    if !self.end
        self.end = self.timers.now()
    self.res = res
    return

TChannelRequest::hookupStreamCallback = (callback) ->
    throw new Error('not implemented')
    return

TChannelRequest::hookupCallback = (callback) ->
    self = this

    onError = (err) ->
        if called
            return
        called = true
        callback err, null, null, null
        return

    onResponse = (res) ->
        if called
            return
        called = true
        withArg23 res, callback
        return

    if callback.canStream
        return self.hookupStreamCallback(callback)
    called = false
    self.on 'error', onError
    self.on 'response', onResponse
    self

TChannelRequest::choosePeer = ->
    self = this
    self.channel.peers.choosePeer self, self.options

TChannelRequest::send = (arg1, arg2, arg3, callback) ->
    self = this
    self.arg1 = arg1
    self.arg2 = arg2
    self.arg3 = arg3
    if callback
        self.hookupCallback callback
    self.start = self.timers.now()
    self.resendSanity = self.limit + 1
    self.resend()
    return

TChannelRequest::resend = ->
    self = this

    onError = (err) ->
        if self.checkTimeout(err)
            return
        if self.shouldRetry(err)
            deferResend()
        else
            self.emit 'error', err
        return

    onResponse = (res) ->
        withArg23 res, (err, res, arg2, arg3) ->
            if self.checkTimeout(err, res)
                return
            if self.shouldRetry(err, res, arg2, arg3)
                deferResend()
            else if err
                self.emit 'error', err
            else
                self.emit 'response', res
            return
        return

    deferResend = ->
        if --self.resendSanity <= 0
            self.emit 'error', new Error('TChannelRequest out of resend sanity')
        else
            process.nextTick doResend
        return

    doResend = ->
        self.resend()
        return

    if self.checkTimeout()
        return
    peer = self.choosePeer()
    if !peer
        if self.outReqs.length
            lastReq = self.outReqs[self.outReqs.length - 1]
            if lastReq.err
                self.emit 'error', lastReq.err
            else
                self.emit 'response', lastReq.res
        else
            self.emit 'error', errors.NoPeerAvailable()
        return
    if self.checkTimeout()
        return
    opts = {}
    keys = Object.keys(self.options)
    i = 0
    while i < keys.length
        key = keys[i]
        opts[key] = self.options[key]
        i++
    opts.timeout = self.timeout - self.elapsed
    outReq = peer.request(opts)
    self.outReqs.push outReq
    self.triedRemoteAddrs[outReq.remoteAddr] = (self.triedRemoteAddrs[outReq.remoteAddr] or 0) + 1
    outReq.on 'response', onResponse
    outReq.on 'error', onError
    outReq.send self.arg1, self.arg2, self.arg3
    return

TChannelRequest::checkTimeout = (err, res) ->
    self = this
    now = self.timers.now()
    self.elapsed = now - self.start
    if self.elapsed < self.timeout
        return false
    if err
        if !self.err
            self.emit 'error', err
    else if res
        if !self.err and !self.res
            self.emit 'response', res
    else if !self.err
        self.emit 'error', errors.TimeoutError(
            start: self.start
            elapsed: self.elapsed
            timeout: self.timeout)
    true

TChannelRequest::shouldRetry = (err, res, arg2, arg3) ->
    self = this
    if self.outReqs.length >= self.limit
        return false
    if self.options.retryFlags.never
        return false
    if err
        switch err.type
            when 'tchannel.bad-request', 'tchannel.canceled'
                return false
            when 'tchannel.busy', 'tchannel.declined'
                return true
            when 'tchannel.timeout'
                return ! !self.options.retryFlags.onTimeout
            when 'tchannel.socket', 'tchannel.socket-closed', 'tchannel.network', 'tchannel.protocol', 'tchannel.unexpected'
                return ! !self.options.retryFlags.onConnectionError
            else
                self.logger.error 'unknown error type in request retry', error: err
                return true
    if !res.ok and self.options.shouldApplicationRetry
        return self.options.shouldApplicationRetry(self, res, arg2, arg3)
    false

module.exports = TChannelRequest
