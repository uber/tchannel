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

TermServer = (options) ->
    if !(this instanceof TermServer)
        return new TermServer(options)
    self = this
    self.options = options or {}
    self.logger = options.logger or nullLogger
    self.sessions = Object.create(null)
    self.sessionId = 0
    return

main = ->
    tchan = require('../channel')
    Logger = require('logtron')
    endhand = require('../endpoint-handler')
    chan = tchan(
        serviceName: 'term-server'
        handler: endhand()
        logger: Logger(
            meta:
                team: 'wat'
                project: 'why'
            backends: Logger.defaultBackends(console: true)))
    server = TermServer(
        logger: chan.logger
        create: TermSession.create)
    server.register chan.handler
    chan.listen 4040, '127.0.0.1'
    return

TermSession = (cmd, options) ->
    if !(this instanceof TermSession)
        return new TermSession(cmd, options)
    options = options or {}
    self = this
    self.cmd = cmd
    self.proc = null
    self.logger = options.logger
    return

withJsonArg2 = (req, buildRes, callback) ->
    req.arg2.onValueReady (err, arg2) ->
        if err
            return buildRes().sendError('UnexpectedError')
        safeParse arg2, (err, val) ->
            if err
                return buildRes().sendError('BadRequest')
            else
                callback val
            return
        return
    return

'use strict'
duplexer = require('duplexer')
safeParse = require('safe-json-parse')
split2 = require('split2')
nullLogger = require('../null-logger.js')

TermServer::register = (handler, startName, controlName) ->
    self = this

    start = (req, buildRes) ->
        self.start req, buildRes
        return

    control = (req, buildRes) ->
        self.control req, buildRes
        return

    start.canStream = true
    handler.register startName or 'start', start
    control.canStream = true
    handler.register controlName or 'control', control
    return

TermServer::start = (req, buildRes) ->
    self = this
    sessionId = ++self.sessionId
    self.options.create sessionId, {
        logger: self.logger
        req: req
        buildRes: buildRes
    }, (err, session) ->
        if err
            buildRes().sendNotOk null, err.message
            return
        self.sessions[sessionId] = session
        res = buildRes(streamed: true)
        res.setOk true
        res.arg2.end JSON.stringify(sessionId: sessionId)
        stream = duplexer(res.arg3, req.arg3)
        session.start stream
        return
    return

TermServer::control = (req, buildRes) ->
    self = this
    withJsonArg2 req, buildRes, (arg2) ->
        sessionId = arg2.sessionId
        session = self.sessions[sessionId]
        if !session
            buildRes().sendNotOk null, 'invalid sessionId'
            return
        res = buildRes(streamed: true)
        res.setOk true
        res.arg2.end()
        stream = duplexer(res.arg3, req.arg3.pipe(split2(JSON.parse)))
        stream.on 'error', (err) ->
            self.logger.error 'control arg3 error', err
            return
        session.control stream
        return
    return

module.exports = TermServer
spawnPty = require('child_pty').spawn

TermSession.create = (sessionId, options, callback) ->
    withJsonArg2 options.req, options.buildRes, (arg2) ->
        callback null, TermSession(arg2.command, options)
        return
    return

TermSession::start = (stream) ->
    self = this
    self.proc = spawnPty(self.cmd[0], self.cmd.slice(1), {})
    self.proc.stdout.pipe(stream).pipe self.proc.stdin
    return

TermSession::control = (stream) ->
    self = this
    stream.on 'data', (obj) ->
        if obj.op == 'resize'
            self.logger.info 'resize to', obj
            self.proc.stdout.resize
                columns: obj.cols
                rows: obj.rows
        else
            self.logger.error 'invalid control op', obj
        return
    return

if require.main == module
    main()
