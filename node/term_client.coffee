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

TermClient = (channel, options) ->
    if !(this instanceof TermClient)
        return new TermClient(channel, options)
    self = this
    EventEmitter.call self
    self.channel = channel
    self.options = options or {}
    self.session = null
    self.stream = null
    self.ctl = null
    return

main = ->
    cmd = process.argv.slice(2)
    tchan = require('../channel')
    chan = tchan()
    client = TermClient(chan,
        request:
            host: '127.0.0.1:4040'
            timeout: 1000
        arg2: JSON.stringify(command: cmd))

    onError = (err) ->
        console.error err
        finish()
        return

    start = ->
        client.linkSize process.stdout
        process.stdin.setRawMode true
        process.stdin.pipe(client.stream).pipe process.stdout
        return

    finish = ->
        process.stdin.setRawMode false
        process.stdin.end()
        chan.close()
        return

    client.on 'error', onError
    client.on 'started', start
    client.on 'finished', finish
    client.start()
    return

'use strict'
async = require('async')
duplexer = require('duplexer')
EventEmitter = require('events').EventEmitter
inherits = require('util').inherits
safeJsonParse = require('safe-json-parse')
extend = require('xtend')
extendInto = require('xtend/mutable')
inherits TermClient, EventEmitter

TermClient::start = ->
    self = this
    if self.session
        self.emit 'error', new Error('already started')
        # TODO typed
        return
    async.waterfall [
        (next) ->
            self.request 'start', self.options.arg2, next
            return
        (req, res, next) ->

            finish = ->
                req.arg3.removeListener 'end', finish
                res.arg3.removeListener 'end', finish
                self.emit 'finished'
                return

            self.stream = duplexer(req.arg3, res.arg3)
            req.arg3.once 'end', finish
            res.arg3.once 'end', finish
            res.arg2.onValueReady next
            return
        safeJsonParse
        (head, next) ->
            self.session = head.sessionId
            self.request 'control', JSON.stringify(sessionId: self.session), next
            return
        (req, res, next) ->
            self.ctl = duplexer(req.arg3, res.arg3)
            self.emit 'started'
            next()
            return
    ], (err) ->
        if err
            self.emit 'error', err
            # TODO wrap
        return
    return

TermClient::request = (arg1, arg2, callback) ->
    self = this
    req = self.channel.request(extend(self.options.request, streamed: true))
    req.hookupStreamCallback callback
    req.arg1.end arg1
    if arg2
        req.arg2.end arg2
    return

TermClient::linkSize = (stream) ->
    self = this

    sendSize = ->
        self.sendControl 'resize',
            cols: stream.columns
            rows: stream.rows
        return

    sendSize()
    stream.on 'resize', sendSize
    return

TermClient::sendControl = (op, extra) ->
    self = this
    if !self.ctl
        self.emit 'error', new Error('no control channel to send op on')
        return
    body = op: op
    if extra
        extendInto body, extra
    self.ctl.write JSON.stringify(body) + '\n'
    return

module.exports = TermClient
if require.main == module
    main()
