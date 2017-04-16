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

main = ->
    chan = tchan(
        serviceName: 'repl-server'
        handler: endhand()
        logger: Logger(
            meta:
                team: 'wat'
                project: 'why'
            backends: Logger.defaultBackends(console: true)))
    statefulThing = counter: 1
    repler = replr.create(
        name: 'tchannel repl server example'
        mode: 'noserver'
        prompt: chalk.gray('tchanrepl> ')
        useColors: true
        useGlobal: true
        ignoreUndefined: true
        exports: ->
            {
                increment: ->
                    statefulThing.counter++
                getStatefulThing: ->
                    statefulThing

            }
    )
    server = TermServer(
        logger: chan.logger
        create: (sessionId, options, callback) ->
            callback null, ReplSession(repler, logger: chan.logger)
            return
    )
    server.register chan.handler
    chan.listen 4040, '127.0.0.1'
    return

ReplSession = (repler, options) ->
    if !(this instanceof ReplSession)
        return new ReplSession(repler, options)
    options = options or {}
    self = this
    self.repler = repler
    self.logger = options.logger
    return

'use strict'
chalk = require('chalk')
EventEmitter = require('events').EventEmitter
Logger = require('logtron')
replr = require('replr')
util = require('util')
tchan = require('../channel')
endhand = require('../endpoint-handler')
TermServer = require('./term_server')
util.inherits ReplSession, EventEmitter

ReplSession::start = (stream) ->
    self = this
    self.once 'resize', (size) ->
        self.repler.open stream,
            width: size.cols
            height: size.rows
        return
    return

ReplSession::control = (stream) ->
    self = this
    stream.on 'data', (obj) ->
        if obj.op == 'resize'
            self.logger.info 'resize to', obj
            self.emit 'resize', obj
        else
            self.logger.error 'invalid control op', obj
        return
    return

if require.main == module
    main()
