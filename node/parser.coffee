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

TChannelParser = (connection) ->
    @newFrame = new TChannelFrame
    @logger = connection.logger
    @state = states.readType
    @tmpInt = null
    @tmpIntBuf = new Buffer(4)
    @tmpIntPos = 0
    @tmpStr = null
    @tmpStrPos = 0
    @pos = null
    @chunk = null
    return

'use strict'
module.exports = TChannelParser
emptyBuffer = new Buffer(0)
TChannelFrame = require('./frame')
states = TChannelParser.States = {}
states.readType = 1
states.readId = 2
states.readSeq = 3
states.readArg1len = 4
states.readArg2len = 5
states.readArg3len = 6
states.readCsum = 7
states.readArg1 = 8
states.readArg2 = 9
states.readArg3 = 10
states.error = 255
require('util').inherits TChannelParser, require('events').EventEmitter

TChannelParser::parseError = (msg) ->
    @emit 'error', new Error(msg)
    @logger.error 'parse error: ' + msg
    @pos = @chunk.length
    @state = states.error
    return

TChannelParser::readType = ->
    newType = @chunk[@pos++]
    @state = states.readId
    @newFrame.header.type = newType
    return

TChannelParser::readInt = ->
    if @tmpIntPos == 0 and @chunk.length >= @pos + 4
        @tmpInt = @chunk.readUInt32BE(@pos, true)
        @pos += 4
        return
    while @tmpIntPos < 4 and @pos < @chunk.length
        @tmpIntBuf[@tmpIntPos++] = @chunk[@pos++]
    if @tmpIntPos == 4
        @tmpInt = @tmpIntBuf.readUInt32BE(0, true)
        @tmpIntPos = 0
    return

TChannelParser::readStr = (len) ->
    if @tmpStr == null
        if @chunk.length - @pos >= len
            @tmpStr = @chunk.slice(@pos, @pos + len)
            @pos += len
            @tmpStrPos = len
        else
            @tmpStr = new Buffer(len)
            @chunk.copy @tmpStr, 0, @pos, @chunk.length
            @tmpStrPos = @chunk.length - @pos
            @pos += @chunk.length - @pos
    else
        bytesToCopy = Math.min(@chunk.length, len - @tmpStrPos)
        @chunk.copy @tmpStr, @tmpStrPos, @pos, @pos + bytesToCopy
        @tmpStrPos += bytesToCopy
        @pos += bytesToCopy
    return

TChannelParser::execute = (chunk) ->
    @pos = 0
    @chunk = chunk
    header = @newFrame.header
    while @pos < chunk.length
        if @state == states.readType
            @readType()
        else if @state == states.readId
            @readInt()
            if typeof @tmpInt == 'number'
                header.id = @tmpInt
                @tmpInt = null
                @state = states.readSeq
        else if @state == states.readSeq
            @readInt()
            if typeof @tmpInt == 'number'
                header.seq = @tmpInt
                @tmpInt = null
                @state = states.readArg1len
        else if @state == states.readArg1len
            @readInt()
            if typeof @tmpInt == 'number'
                header.arg1len = @tmpInt
                @tmpInt = null
                @state = states.readArg2len
        else if @state == states.readArg2len
            @readInt()
            if typeof @tmpInt == 'number'
                header.arg2len = @tmpInt
                @tmpInt = null
                @state = states.readArg3len
        else if @state == states.readArg3len
            @readInt()
            if typeof @tmpInt == 'number'
                header.arg3len = @tmpInt
                @tmpInt = null
                @state = states.readCsum
        else if @state == states.readCsum
            @readInt()
            if typeof @tmpInt == 'number'
                header.csum = @tmpInt
                @tmpInt = null
                @state = states.readArg1
        else if @state == states.readArg1
            @readStr header.arg1len
            if @tmpStrPos == header.arg1len
                @newFrame.arg1 = @tmpStr
                @tmpStr = null
                @tmpStrPos = 0
                if header.arg2len == 0 and header.arg3len == 0
                    @emitAndReset()
                    header = @newFrame.header
                else
                    @state = states.readArg2
        else if @state == states.readArg2
            @readStr header.arg2len
            if @tmpStrPos == header.arg2len
                @newFrame.arg2 = @tmpStr
                @tmpStr = null
                @tmpStrPos = 0
                if header.arg3len == 0
                    @emitAndReset()
                    header = @newFrame.header
                else
                    @state = states.readArg3
        else if @state == states.readArg3
            @readStr header.arg3len
            if @tmpStrPos == header.arg3len
                @newFrame.arg3 = @tmpStr
                @emitAndReset()
                header = @newFrame.header
        else if @state != states.error
            throw new Error('unknown state ' + @state)
    return

TChannelParser::emitAndReset = ->
    @tmpStr = null
    @tmpStrPos = 0
    if @newFrame.header.arg2len == 0
        @newFrame.arg2 = emptyBuffer
    if @newFrame.header.arg3len == 0
        @newFrame.arg3 = emptyBuffer
    err = @newFrame.verifyChecksum()
    if err
        @emit 'error', err
        return
    @emit 'frame', @newFrame
    @newFrame = new TChannelFrame
    @state = states.readType
    return
