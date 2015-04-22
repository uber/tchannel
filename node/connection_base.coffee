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

TChannelConnectionBase = (channel, direction, remoteAddr) ->
    assert !channel.destroyed, 'refuse to create connection for destroyed channel'
    self = this
    EventEmitter.call self
    self.channel = channel
    self.options = self.channel.options
    self.logger = channel.logger
    self.random = channel.random
    self.timers = channel.timers
    self.direction = direction
    self.remoteAddr = remoteAddr
    self.timer = null
    self.remoteName = null
    # filled in by identify message
    # TODO: factor out an operation collection abstraction
    self.requests =
        in: Object.create(null)
        out: Object.create(null)
    self.pending =
        in: 0
        out: 0
    self.lastTimeoutTime = 0
    self.closing = false
    self.startTimeoutTimer()
    self.tracer = self.channel.tracer
    return

'use strict'
assert = require('assert')
inherits = require('util').inherits
EventEmitter = require('events').EventEmitter
errors = require('./errors')
OutResponse = require('./out_response')
DEFAULT_OUTGOING_REQ_TIMEOUT = 2000
inherits TChannelConnectionBase, EventEmitter

TChannelConnectionBase::close = (callback) ->
    self = this
    self.resetAll errors.SocketClosedError(reason: 'local close')
    callback()
    return

# timeout check runs every timeoutCheckInterval +/- some random fuzz. Range is from
#   base - fuzz/2 to base + fuzz/2

TChannelConnectionBase::getTimeoutDelay = ->
    self = this
    base = self.options.timeoutCheckInterval
    fuzz = self.options.timeoutFuzz
    if fuzz
        fuzz = Math.round(Math.floor(self.random() * fuzz) - fuzz / 2)
    base + fuzz

TChannelConnectionBase::startTimeoutTimer = ->
    self = this
    self.timer = self.timers.setTimeout((->
        # TODO: worth it to clear the fired self.timer objcet?
        self.onTimeoutCheck()
        return
    ), self.getTimeoutDelay())
    return

TChannelConnectionBase::clearTimeoutTimer = ->
    self = this
    if self.timer
        self.timers.clearTimeout self.timer
        self.timer = null
    return

# If the connection has some success and some timeouts, we should probably leave it up,
# but if everything is timing out, then we should kill the connection.

TChannelConnectionBase::onTimeoutCheck = ->
    self = this
    if self.closing
        return
    if self.lastTimeoutTime
        self.emit 'timedOut'
    else
        self.checkTimeout self.requests.out, 'out'
        self.checkTimeout self.requests.in, 'in'
        self.startTimeoutTimer()
    return

TChannelConnectionBase::checkTimeout = (ops, direction) ->
    self = this
    opKeys = Object.keys(ops)
    i = 0
    while i < opKeys.length
        id = opKeys[i]
        req = ops[id]
        if req == undefined
            self.logger.warn 'unexpected undefined request',
                direction: direction
                id: id
        else if req.timedOut
            self.logger.warn 'lingering timed-out request',
                direction: direction
                id: id
            delete ops[id]
            self.pending[direction]--
        else if req.checkTimeout()
            if direction == 'out'
                self.lastTimeoutTime = self.timers.now()
                # } else {
                #     req.res.sendError // XXX may need to build
            delete ops[id]
            self.pending[direction]--
        i++
    return

# this connection is completely broken, and is going away
# In addition to erroring out all of the pending work, we reset the state in case anybody
# stumbles across this object in a core dump.

TChannelConnectionBase::resetAll = (err) ->
    self = this
    self.clearTimeoutTimer()
    if self.closing
        return
    self.closing = true
    inOpKeys = Object.keys(self.requests.in)
    outOpKeys = Object.keys(self.requests.out)
    if !err
        err = new Error('unknown connection reset')
        # TODO typed error
    isError = err.type.indexOf('tchannel.socket') != 0
    self.logger[if isError then 'warn' else 'info'] 'resetting connection',
        error: err
        remoteName: self.remoteName
        localName: self.channel.hostPort
        numInOps: inOpKeys.length
        numOutOps: outOpKeys.length
        inPending: self.pending.in
        outPending: self.pending.out
    if isError
        self.emit 'error', err
    # requests that we've received we can delete, but these reqs may have started their
    #   own outgoing work, which is hard to cancel. By setting this.closing, we make sure
    #   that once they do finish that their callback will swallow the response.
    inOpKeys.forEach (id) ->
        # TODO: support canceling pending handlers
        delete self.requests.in[id]
        # TODO report or handle or log errors or something
        return
    # for all outgoing requests, forward the triggering error to the user callback
    outOpKeys.forEach (id) ->
        req = self.requests.out[id]
        delete self.requests.out[id]
        # TODO: shared mutable object... use Object.create(err)?
        req.emit 'error', err
        return
    self.pending.in = 0
    self.pending.out = 0
    return

TChannelConnectionBase::popOutReq = (id) ->
    self = this
    req = self.requests.out[id]
    if !req
        # TODO else case. We should warn about an incoming response for an
        # operation we did not send out.  This could be because of a timeout
        # or could be because of a confused / corrupted server.
        return
    delete self.requests.out[id]
    self.pending.out--
    req

# create a request

TChannelConnectionBase::request = (options) ->
    self = this
    if !options
        options = {}
    options.remoteAddr = self.remoteAddr
    # TODO: use this to protect against >4Mi outstanding messages edge case
    # (e.g. zombie operation bug, incredible throughput, or simply very long
    # timeout
    # assert(!self.requests.out[id], 'duplicate frame id in flight');
    # TODO: provide some sort of channel default for "service"
    # TODO: generate tracing if empty?
    # TODO: refactor callers
    options.checksumType = options.checksum
    # TODO: better default, support for dynamic
    options.ttl = options.timeout or DEFAULT_OUTGOING_REQ_TIMEOUT
    options.tracer = self.tracer
    req = self.buildOutRequest(options)
    self.requests.out[req.id] = req
    self.pending.out++
    req

TChannelConnectionBase::handleCallRequest = (req) ->
    self = this

    onReqError = (err) ->
        if !req.res
            buildResponse()
        if err.type == 'tchannel.timeout'
            req.res.sendError 'Timeout', err.message
        else
            errName = err.name or err.constructor.name
            req.res.sendError 'UnexpectedError', errName + ': ' + err.message
        return

    runHandler = ->
        self.channel.handler.handleRequest req, buildResponse
        return

    handleSpanFromRes = (span) ->
        self.emit 'span', span
        return

    buildResponse = (options) ->
        if req.res and req.res.state != OutResponse.States.Initial
            self.emit 'error', errors.ResponseAlreadyStarted(state: req.res.state)
        req.res = self.buildOutResponse(req, options)
        req.res.on 'finish', opDone
        req.res.on 'errored', opDone
        req.res.on 'span', handleSpanFromRes
        req.res

    opDone = ->
        if done
            return
        done = true
        if self.requests.in[req.id] != req
            self.logger.warn 'mismatched opDone callback',
                hostPort: self.channel.hostPort
                id: req.id
            return
        delete self.requests.in[req.id]
        self.pending.in--
        return

    req.remoteAddr = self.remoteName
    self.pending.in++
    self.requests.in[req.id] = req
    done = false
    req.on 'error', onReqError
    process.nextTick runHandler
    return

module.exports = TChannelConnectionBase
