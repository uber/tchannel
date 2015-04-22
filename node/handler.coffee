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

TChannelV2Handler = (options) ->
    if !(this instanceof TChannelV2Handler)
        return new TChannelV2Handler(options)
    self = this
    EventEmitter.call self
    self.options = options or {}
    self.logger = self.options.logger
    self.random = self.options.random
    self.timers = self.options.timers
    self.tracer = self.options.tracer
    self.hostPort = self.options.hostPort
    self.processName = self.options.processName
    self.remoteHostPort = null
    # filled in by identify message
    self.lastSentFrameId = 0
    # TODO: GC these... maybe that's up to TChannel itself wrt ops
    self.streamingReq = Object.create(null)
    self.streamingRes = Object.create(null)
    self.writeBuffer = new Buffer(v2.Frame.MaxSize)
    return

'use strict'
EventEmitter = require('events').EventEmitter
util = require('util')
OutRequest = require('../out_request')
OutResponse = require('../out_response')
InRequest = require('../in_request')
InResponse = require('../in_response')
v2 = require('./index')
errors = require('../errors')
SERVER_TIMEOUT_DEFAULT = 1000
module.exports = TChannelV2Handler
util.inherits TChannelV2Handler, EventEmitter

TChannelV2Handler::write = ->
    self = this
    self.emit 'error', new Error('write not implemented')
    return

TChannelV2Handler::writeCopy = (buffer) ->
    self = this
    copy = new Buffer(buffer.length)
    buffer.copy copy
    self.write copy
    return

TChannelV2Handler::pushFrame = (frame) ->
    self = this
    writeBuffer = self.writeBuffer
    res = v2.Frame.RW.writeInto(frame, writeBuffer, 0)
    err = res.err
    if err
        if !Buffer.isBuffer(err.buffer)
            err.buffer = writeBuffer
        if typeof err.offset != 'number'
            err.offset = res.offset
        self.emit 'write.error', err
    else
        buf = writeBuffer.slice(0, res.offset)
        self.writeCopy buf
    return

TChannelV2Handler::nextFrameId = ->
    self = this
    self.lastSentFrameId = (self.lastSentFrameId + 1) % v2.Frame.MaxId
    self.lastSentFrameId

TChannelV2Handler::handleFrame = (frame, callback) ->
    self = this
    switch frame.body.type
        when v2.Types.InitRequest
            return self.handleInitRequest(frame, callback)
        when v2.Types.InitResponse
            return self.handleInitResponse(frame, callback)
        when v2.Types.CallRequest
            return self.handleCallRequest(frame, callback)
        when v2.Types.CallResponse
            return self.handleCallResponse(frame, callback)
        when v2.Types.CallRequestCont
            return self.handleCallRequestCont(frame, callback)
        when v2.Types.CallResponseCont
            return self.handleCallResponseCont(frame, callback)
        when v2.Types.ErrorResponse
            return self.handleError(frame, callback)
        else
            return callback(errors.TChannelUnhandledFrameTypeError(typeCode: frame.body.type))
    return

TChannelV2Handler::handleInitRequest = (reqFrame, callback) ->
    self = this
    if self.remoteHostPort != null
        return callback(new Error('duplicate init request'))
        # TODO typed error

    ### jshint camelcase:false ###

    headers = reqFrame.body.headers
    init = 
        hostPort: headers.host_port
        processName: headers.process_name

    ### jshint camelcase:true ###

    self.remoteHostPort = init.hostPort
    self.emit 'init.request', init
    self.sendInitResponse reqFrame
    callback()
    return

TChannelV2Handler::handleInitResponse = (resFrame, callback) ->
    self = this
    if self.remoteHostPort != null
        return callback(new Error('duplicate init response'))
        # TODO typed error

    ### jshint camelcase:false ###

    headers = resFrame.body.headers
    init = 
        hostPort: headers.host_port
        processName: headers.process_name

    ### jshint camelcase:true ###

    self.remoteHostPort = init.hostPort
    self.emit 'init.response', init
    callback()
    return

TChannelV2Handler::handleCallRequest = (reqFrame, callback) ->
    self = this
    if self.remoteHostPort == null
        return callback(new Error('call request before init request'))
        # TODO typed error
    req = self.buildInRequest(reqFrame)
    self._handleCallFrame req, reqFrame, (err) ->
        if err
            return callback(err)
        if req.state == InRequest.States.Streaming
            self.streamingReq[req.id] = req
        self.emit 'call.incoming.request', req
        callback()
        return
    return

TChannelV2Handler::handleCallResponse = (resFrame, callback) ->
    self = this
    if self.remoteHostPort == null
        return callback(new Error('call response before init response'))
        # TODO typed error
    res = self.buildInResponse(resFrame)
    res.remoteAddr = self.remoteHostPort
    self._handleCallFrame res, resFrame, (err) ->
        if err
            return callback(err)
        if res.state == InResponse.States.Streaming
            self.streamingRes[res.id] = res
        self.emit 'call.incoming.response', res
        callback()
        return
    return

TChannelV2Handler::handleCallRequestCont = (reqFrame, callback) ->
    self = this
    if self.remoteHostPort == null
        return callback(new Error('call request cont before init request'))
        # TODO typed error
    id = reqFrame.id
    req = self.streamingReq[id]
    if !req
        return callback(new Error('call request cont for unknown request'))
        # TODO typed error
    self._handleCallFrame req, reqFrame, callback
    return

TChannelV2Handler::handleCallResponseCont = (resFrame, callback) ->
    self = this
    if self.remoteHostPort == null
        return callback(new Error('call response cont before init response'))
        # TODO typed error
    id = resFrame.id
    res = self.streamingRes[id]
    if !res
        return callback(new Error('call response cont for unknown response'))
        # TODO typed error
    self._handleCallFrame res, resFrame, callback
    return

TChannelV2Handler::handleError = (errFrame, callback) ->
    self = this
    id = errFrame.id
    code = errFrame.body.code
    message = String(errFrame.body.message)
    err = v2.ErrorResponse.CodeErrors[code](
        originalId: id
        message: message)
    if id == v2.Frame.NullId
        # fatal error not associated with a prior frame
        callback err
    else
        self.emit 'call.incoming.error', err
        callback()
    return

TChannelV2Handler::_handleCallFrame = (r, frame, callback) ->
    self = this
    states = r.constructor.States
    if r.state == states.Done
        callback new Error('got cont in done state')
        # TODO typed error
        return
    checksum = r.checksum
    if checksum.type != frame.body.csum.type
        callback new Error('checksum type changed mid-stream')
        # TODO typed error
        return
    err = frame.body.verifyChecksum(checksum.val)
    if err
        callback err
        # TODO wrap context
        return
    r.checksum = frame.body.csum
    isLast = !(frame.body.flags & v2.CallFlags.Fragment)
    r.handleFrame frame.body.args
    if isLast
        r.handleFrame null
        r.state = states.Done
    else if r.state == states.Initial
        r.state = states.Streaming
    else if r.state != states.Streaming
        self.emit 'error', new Error('unknown frame handling state')
    callback()
    return

TChannelV2Handler::sendInitRequest = ->
    self = this
    id = self.nextFrameId()
    # TODO: assert(id === 1)?
    hostPort = self.hostPort or '0.0.0.0:0'
    processName = self.processName
    body = new (v2.InitRequest)(v2.VERSION,
        host_port: hostPort
        process_name: processName)
    reqFrame = new (v2.Frame)(id, body)
    self.pushFrame reqFrame
    return

TChannelV2Handler::sendInitResponse = (reqFrame) ->
    self = this
    id = reqFrame.id
    hostPort = self.hostPort
    processName = self.processName
    body = new (v2.InitResponse)(v2.VERSION,
        host_port: hostPort
        process_name: processName)
    resFrame = new (v2.Frame)(id, body)
    self.pushFrame resFrame
    return

TChannelV2Handler::sendCallRequestFrame = (req, flags, args) ->
    self = this
    reqBody = new (v2.CallRequest)(flags, req.ttl, req.tracing, req.service, req.headers, req.checksum.type, args)
    req.checksum = self._sendCallBodies(req.id, reqBody, null)
    return

TChannelV2Handler::sendCallResponseFrame = (res, flags, args) ->
    self = this
    code = if res.ok then v2.CallResponse.Codes.OK else v2.CallResponse.Codes.Error
    resBody = new (v2.CallResponse)(flags, code, res.tracing, res.headers, res.checksum.type, args)
    res.checksum = self._sendCallBodies(res.id, resBody, null)
    return

TChannelV2Handler::sendCallRequestContFrame = (req, flags, args) ->
    self = this
    reqBody = new (v2.CallRequestCont)(flags, req.checksum.type, args)
    req.checksum = self._sendCallBodies(req.id, reqBody, req.checksum)
    return

TChannelV2Handler::sendCallResponseContFrame = (res, flags, args) ->
    self = this
    resBody = new (v2.CallResponseCont)(flags, res.checksum.type, args)
    res.checksum = self._sendCallBodies(res.id, resBody, res.checksum)
    return

TChannelV2Handler::_sendCallBodies = (id, body, checksum) ->
    self = this
    frame = undefined
    # jshint boss:true
    loop
        if checksum
            body.csum = checksum
        frame = new (v2.Frame)(id, body)
        self.pushFrame frame
        checksum = body.csum
        unless body = body.cont
            break
    checksum

TChannelV2Handler::sendErrorFrame = (r, codeString, message) ->
    self = this
    code = v2.ErrorResponse.Codes[codeString]
    if code == undefined
        self.logger.error 'invalid error frame code string', codeString: codeString
        code = v2.ErrorResponse.Codes.UnexpectedError
        message = 'UNKNOWN CODE(' + codeString + '): ' + message
    errBody = new (v2.ErrorResponse)(code, r.tracing, message)
    errFrame = new (v2.Frame)(r.id, errBody)
    self.pushFrame errFrame
    return

TChannelV2Handler::buildOutRequest = (options) ->
    self = this
    id = self.nextFrameId()

    sendCallRequestFrame = (args, isLast) ->
        flags = 0
        if !isLast
            flags |= v2.CallFlags.Fragment
        self.sendCallRequestFrame req, flags, args
        return

    sendCallRequestContFrame = (args, isLast) ->
        flags = 0
        if !isLast
            flags |= v2.CallFlags.Fragment
        self.sendCallRequestContFrame req, flags, args
        return

    if options.checksumType == undefined or options.checksumType == null
        options.checksumType = v2.Checksum.Types.CRC32C
    options.checksum = new (v2.Checksum)(options.checksumType)
    if !options.headers
        options.headers = {}
    options.headers.re = v2.encodeRetryFlags(options.retryFlags)
    options.sendFrame =
        callRequest: sendCallRequestFrame
        callRequestCont: sendCallRequestContFrame
    req = new OutRequest(id, options)
    req

TChannelV2Handler::buildOutResponse = (req, options) ->
    self = this

    sendCallResponseFrame = (args, isLast) ->
        flags = 0
        if !isLast
            flags |= v2.CallFlags.Fragment
        self.sendCallResponseFrame res, flags, args
        return

    sendCallResponseContFrame = (args, isLast) ->
        flags = 0
        if !isLast
            flags |= v2.CallFlags.Fragment
        self.sendCallResponseContFrame res, flags, args
        return

    sendErrorFrame = (codeString, message) ->
        self.sendErrorFrame req, codeString, message
        return

    if !options
        options = {}
    options.tracing = req.tracing
    options.span = req.span
    options.checksumType = req.checksum.type
    options.checksum = new (v2.Checksum)(req.checksum.type)
    options.sendFrame =
        callResponse: sendCallResponseFrame
        callResponseCont: sendCallResponseContFrame
        error: sendErrorFrame
    res = new OutResponse(req.id, options)
    res

TChannelV2Handler::buildInRequest = (reqFrame) ->
    self = this
    retryFlags = v2.parseRetryFlags(reqFrame.body.headers.re)
    new InRequest(reqFrame.id,
        logger: self.logger
        random: self.random
        timers: self.timers
        tracer: self.tracer
        ttl: reqFrame.body.ttl or SERVER_TIMEOUT_DEFAULT
        tracing: reqFrame.body.tracing
        service: reqFrame.body.service
        headers: reqFrame.body.headers
        retryFlags: retryFlags
        checksum: new (v2.Checksum)(reqFrame.body.csum.type)
        streamed: reqFrame.body.flags & v2.CallFlags.Fragment
        hostPort: self.hostPort)

TChannelV2Handler::buildInResponse = (resFrame) ->
    self = this
    new InResponse(resFrame.id,
        logger: self.logger
        random: self.random
        timers: self.timers
        code: resFrame.body.code
        checksum: new (v2.Checksum)(resFrame.body.csum.type)
        streamed: resFrame.body.flags & v2.CallFlags.Fragment)
