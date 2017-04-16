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

TChannelConnection = (channel, socket, direction, remoteAddr) ->
    assert remoteAddr != channel.hostPort, 'refusing to create self connection'
    self = this
    TChannelConnectionBase.call self, channel, direction, remoteAddr
    self.socket = socket
    opts = 
        logger: self.channel.logger
        random: self.channel.random
        timers: self.channel.timers
        hostPort: self.channel.hostPort
        tracer: self.tracer
    # jshint forin:false
    for prop of self.options
        opts[prop] = self.options[prop]
    # jshint forin:true
    self.handler = new (v2.Handler)(opts)
    self.mach = ReadMachine(bufrw.UInt16BE, v2.Frame.RW)
    self.setupSocket()
    self.setupHandler()
    self.start()
    return

'use strict'
assert = require('assert')
bufrw = require('bufrw')
ReadMachine = require('bufrw/stream/read_machine')
inherits = require('util').inherits
v2 = require('./v2')
errors = require('./errors')
TChannelConnectionBase = require('./connection_base')
inherits TChannelConnection, TChannelConnectionBase

TChannelConnection::setupSocket = ->
    self = this

    onSocketChunk = (chunk) ->
        self.mach.handleChunk chunk, chunkHandled
        return

    chunkHandled = (err) ->
        if err
            self.resetAll errors.TChannelReadProtocolError(err,
                remoteName: self.remoteName
                localName: self.channel.hostPort)
            self.socket.destroy()
        return

    onSocketClose = ->
        self.resetAll errors.SocketClosedError(reason: 'remote clossed')
        if self.remoteName == '0.0.0.0:0'
            self.channel.peers.delete self.remoteAddr
        return

    onSocketError = (err) ->
        self.onSocketError err
        return

    self.socket.setNoDelay true
    self.socket.on 'data', onSocketChunk
    self.socket.on 'close', onSocketClose
    self.socket.on 'error', onSocketError
    return

TChannelConnection::setupHandler = ->
    self = this
    # TODO: restore dumping from old:
    # var stream = self.socket;
    # if (dumpEnabled) {
    #     stream = stream.pipe(Spy(process.stdout, {
    #         prefix: '>>> ' + self.remoteAddr + ' '
    #     }));
    # }
    # stream = stream
    #     .pipe(self.reader)
    #     .pipe(self.handler)
    #     ;
    # if (dumpEnabled) {
    #     stream = stream.pipe(Spy(process.stdout, {
    #         prefix: '<<< ' + self.remoteAddr + ' '
    #     }));
    # }
    # stream = stream
    #     .pipe(self.socket)
    #     ;

    onWriteError = (err) ->
        self.resetAll errors.TChannelWriteProtocolError(err,
            remoteName: self.remoteName
            localName: self.channel.hostPort)
        self.socket.destroy()
        return

    onHandlerError = (err) ->
        self.resetAll err
        # resetAll() does not close the socket
        self.socket.destroy()
        return

    handleReadFrame = (frame) ->
        if !self.closing
            self.lastTimeoutTime = 0
        self.handler.handleFrame frame, handledFrame
        return

    handledFrame = (err) ->
        if err
            onHandlerError err
        return

    onCallRequest = (req) ->
        self.handleCallRequest req
        return

    onCallResponse = (res) ->
        req = self.popOutReq(res.id)
        if !req
            self.logger.info 'response received for unknown or lost operation',
                responseId: res.id
                code: res.code
                arg1: if Buffer.isBuffer(res.arg1) then String(res.arg1) else 'streamed-arg1'
                remoteAddr: self.remoteAddr
                direction: self.direction
            return
        if self.tracer
            # TODO: better annotations
            req.span.annotate 'cr'
            self.tracer.report req.span
            res.span = req.span
        req.emit 'response', res
        return

    onCallError = (err) ->
        req = self.popOutReq(err.originalId)
        if !req
            self.logger.info 'error received for unknown or lost operation', err
            return
        req.emit 'error', err
        return

    onTimedOut = ->
        self.logger.warn self.channel.hostPort + ' destroying socket from timeouts'
        self.socket.destroy()
        return

    self.handler.write = (buf, done) ->
        self.socket.write buf, null, done
        return

    self.mach.emit = handleReadFrame
    self.handler.on 'write.error', onWriteError
    self.handler.on 'error', onHandlerError
    self.handler.on 'call.incoming.request', onCallRequest
    self.handler.on 'call.incoming.response', onCallResponse
    self.handler.on 'call.incoming.error', onCallError
    self.on 'timedOut', onTimedOut
    return

TChannelConnection::start = ->
    self = this

    onOutIdentified = (init) ->
        self.remoteName = init.hostPort
        self.emit 'identified',
            hostPort: init.hostPort
            processName: init.processName
        return

    onInIdentified = (init) ->
        if init.hostPort == '0.0.0.0:0'
            self.remoteName = '' + self.socket.remoteAddress + ':' + self.socket.remotePort
            assert self.remoteName != self.channel.hostPort, 'should not be able to receive ephemeral connection from self'
        else
            self.remoteName = init.hostPort
        self.channel.peers.add(self.remoteName).addConnection self
        self.emit 'identified',
            hostPort: self.remoteName
            processName: init.processName
        return

    if self.direction == 'out'
        self.handler.sendInitRequest()
        self.handler.once 'init.response', onOutIdentified
    else
        self.handler.once 'init.request', onInIdentified
    return

TChannelConnection::close = (callback) ->
    self = this
    if self.socket.destroyed
        callback()
    else
        self.socket.once 'close', callback
        self.resetAll errors.SocketClosedError(reason: 'local close')
        self.socket.destroy()
    return

TChannelConnection::onSocketError = (err) ->
    self = this
    if !self.closing
        self.resetAll errors.SocketError(err,
            hostPort: self.channel.hostPort
            direction: self.direction
            remoteAddr: self.remoteAddr)
    return

TChannelConnection::buildOutRequest = (options) ->
    self = this
    opts = 
        logger: self.logger
        random: self.random
        timers: self.timers
    if options
        # jshint forin:false
        for prop of options
            opts[prop] = options[prop]
        # jshint forin:true
    self.handler.buildOutRequest opts

TChannelConnection::buildOutResponse = (req, options) ->
    self = this
    opts = 
        logger: self.logger
        random: self.random
        timers: self.timers
    if options
        # jshint forin:false
        for prop of options
            opts[prop] = options[prop]
        # jshint forin:true
    self.handler.buildOutResponse req, opts

module.exports = TChannelConnection
