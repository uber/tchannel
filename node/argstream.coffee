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

ArgStream = ->
    self = this

    passError = (err) ->
        self.emit 'error', err
        return

    EventEmitter.call self
    self.arg1 = StreamArg()
    self.arg2 = StreamArg()
    self.arg3 = StreamArg()
    self.arg1.on 'error', passError
    self.arg2.on 'error', passError
    self.arg3.on 'error', passError
    self.arg2.on 'start', ->
        if !self.arg1._writableState.ended
            self.arg1.end()
        return
    self.arg3.on 'start', ->
        if !self.arg2._writableState.ended
            self.arg2.end()
        return
    return

InArgStream = ->

    argFinished = ->
        if ++self._numFinished == 3
            self.finished = true
            self.emit 'finish'
        return

    if !(this instanceof InArgStream)
        return new InArgStream
    self = this
    ArgStream.call self
    self.streams = [
        self.arg1
        self.arg2
        self.arg3
    ]
    self._iStream = 0
    self.finished = false
    self._numFinished = 0
    self.arg1.on 'finish', argFinished
    self.arg2.on 'finish', argFinished
    self.arg3.on 'finish', argFinished
    return

OutArgStream = ->
    if !(this instanceof OutArgStream)
        return new OutArgStream
    self = this
    ArgStream.call self
    self._flushImmed = null
    self.finished = false
    self.frame = [ Buffer(0) ]
    self.currentArgN = 1
    self.arg1.on 'data', (chunk) ->
        self._handleFrameChunk 1, chunk
        return
    self.arg2.on 'data', (chunk) ->
        self._handleFrameChunk 2, chunk
        return
    self.arg3.on 'data', (chunk) ->
        self._handleFrameChunk 3, chunk
        return
    self.arg1.on 'finish', ->
        self._handleFrameChunk 1, null
        return
    self.arg2.on 'finish', ->
        self._handleFrameChunk 2, null
        return
    self.arg3.on 'finish', ->
        self._handleFrameChunk 3, null
        self._flushParts true
        self.finished = true
        self.emit 'finish'
        return
    return

StreamArg = (options) ->
    if !(this instanceof StreamArg)
        return new StreamArg(options)
    self = this
    PassThrough.call self, options
    self.started = false
    self.onValueReady = self.onValueReady.bind(self)
    return

bufferStreamData = (stream, callback) ->
    parts = []

    onData = (chunk) ->
        parts.push chunk
        return

    finish = (err) ->
        stream.removeListener 'data', onData
        stream.removeListener 'error', finish
        stream.removeListener 'end', finish
        buf = Buffer.concat(parts)
        if err == undefined
            err = null
        callback err, buf
        return

    stream.on 'data', onData
    stream.on 'error', finish
    stream.on 'end', finish
    return

'use strict'

###
# Provides federated streams for handling call arguments
#
# InArgStream is for handling incoming arg parts from call frames.  It handles
# dispatching the arg chunks into .arg{1,2,3} streams.
#
# OutArgStream is for creating outgoing arg parts by writing to .arg{1,2,3}
# streams.  It handles buffering as many parts as are written within one event
# loop tick into an Array of arg chunks.  Such array is then flushed using
# setImmediate.
#
# Due to the semantic complexity involved here, this code is tested by an
# accompanying exhaistive search test in test/argstream.js.  This test has
# both unit tests (disabled by default for speed) and an integration test.
###

inherits = require('util').inherits
EventEmitter = require('events').EventEmitter
PassThrough = require('readable-stream').PassThrough
Ready = require('ready-signal')
errors = require('./errors')
inherits ArgStream, EventEmitter
inherits InArgStream, ArgStream

InArgStream::handleFrame = (parts) ->
    self = this
    stream = self.streams[self._iStream]

    advance = ->
        if self._iStream < self.streams.length
            self.streams[self._iStream].end()
            self._iStream++
        self.streams[self._iStream]

    if parts == null
        while stream
            stream = advance()
        return
    if self.finished
        self.emit 'error', new Error('arg stream finished')
        # TODO typed error
    i = 0
    while i < parts.length
        if i > 0
            stream = advance()
        if !stream
            break
        if parts[i].length
            stream.write parts[i]
        i++
    if i < parts.length
        self.emit 'error', new Error('frame parts exceeded stream arity')
        # TODO clearer / typed error
    return

inherits OutArgStream, ArgStream

OutArgStream::_handleFrameChunk = (n, chunk) ->
    self = this
    if n < self.currentArgN
        self.emit 'error', errors.ArgChunkOutOfOrderError(
            current: self.currentArgN
            got: n)
    else if n > self.currentArgN
        if n - self.currentArgN > 1
            self.emit 'error', errors.ArgChunkGapError(
                current: self.currentArgN
                got: n)
        self.currentArgN++
        self.frame.push chunk
    else if chunk == null
        if ++self.currentArgN <= 3
            self.frame.push Buffer(0)
    else
        self._appendFrameChunk chunk
    self._deferFlushParts()
    return

OutArgStream::_appendFrameChunk = (chunk) ->
    self = this
    i = self.frame.length - 1
    buf = self.frame[i]
    if buf.length
        self.frame[i] = Buffer.concat([
            buf
            chunk
        ])
    else
        self.frame[i] = chunk
    return

OutArgStream::_deferFlushParts = ->
    self = this
    if !self._flushImmed
        self._flushImmed = setImmediate(->
            self._flushParts()
            return
        )
    return

OutArgStream::_flushParts = (isLast) ->
    self = this
    if self._flushImmed
        clearImmediate self._flushImmed
        self._flushImmed = null
    if self.finished
        return
    isLast = Boolean(isLast)
    frame = self.frame
    self.frame = [ Buffer(0) ]
    if frame.length
        self.emit 'frame', frame, isLast
    return

inherits StreamArg, PassThrough

StreamArg::_write = (chunk, encoding, callback) ->
    self = this
    if !self.started
        self.started = true
        self.emit 'start'
    PassThrough::_write.call self, chunk, encoding, callback
    return

StreamArg::onValueReady = (callback) ->
    self = this
    self.onValueReady = Ready()
    bufferStreamData self, self.onValueReady.signal
    self.onValueReady callback
    return

module.exports.InArgStream = InArgStream
module.exports.OutArgStream = OutArgStream
