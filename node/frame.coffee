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

Frame = (id, body) ->
    self = this
    self.size = 0
    self.type = body and body.type or 0
    if id == null or id == undefined
        self.id = Frame.NullId
    else
        self.id = id
    self.body = body
    return

frameLength = (frame) ->
    body = frame.body
    bodyRW = body.constructor.RW
    length = 0
    length += bufrw.UInt16BE.width
    # size:2:
    length += bufrw.UInt8.width
    # type:1
    length += 1
    # reserved:1
    length += bufrw.UInt32BE.width
    # id:4
    length += 8
    # reserved:8 ...
    res = bodyRW.byteLength(body)
    if !res.err
        res.length += length
    res

readFrameFrom = (buffer, offset) ->
    frame = new Frame
    res = undefined
    res = bufrw.UInt16BE.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    frame.size = res.value
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    frame.type = res.value
    BodyType = Frame.Types[frame.type]
    if !BodyType
        return bufrw.ReadResult.error(errors.InvalidFrameTypeError(typeNumber: frame.type), offset - 1)
    offset += 1
    res = bufrw.UInt32BE.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    frame.id = res.value
    offset += 8
    res = BodyType.RW.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    frame.body = res.value
    res.value = frame
    res

writeFrameInto = (frame, buffer, offset) ->
    body = frame.body
    bodyRW = body.constructor.RW
    start = offset
    end = offset
    res = undefined
    # skip size, write later
    offset += bufrw.UInt16BE.width
    res = bufrw.UInt8.writeInto(frame.type, buffer, offset)
    if res.err
        return res
    offset = res.offset
    end = offset + 1
    buffer.fill 0, offset, end
    offset = end
    res = bufrw.UInt32BE.writeInto(frame.id, buffer, offset)
    if res.err
        return res
    offset = res.offset
    end = offset + 8
    buffer.fill 0, offset, end
    offset = end
    res = bodyRW.writeInto(body, buffer, offset)
    if res.err
        return res
    offset = res.offset
    frame.size = res.offset - start
    res = bufrw.UInt16BE.writeInto(frame.size, buffer, start)
    if res.err
        return res
    res.offset = offset
    res

'use strict'
bufrw = require('bufrw')
errors = require('../errors')

### jshint maxparams:5 ###

module.exports = Frame
Frame.Overhead = 0x10
Frame.MaxSize = 0xffff
Frame.MaxBodySize = Frame.MaxSize - Frame.Overhead
Frame.MaxId = 0xfffffffe
Frame.NullId = 0xffffffff
# size:2: type:1 reserved:1 id:4 reserved:8 ...
Frame.RW = bufrw.Base(frameLength, readFrameFrom, writeFrameInto)

Frame.fromBuffer = (buffer) ->
    bufrw.fromBuffer Frame.RW, buffer, 0

Frame::byteLength = ->
    self = this
    bufrw.byteLength Frame.RW, self

Frame::intoBuffer = (buffer) ->
    self = this
    bufrw.intoBuffer Frame.RW, self, buffer

Frame::toBuffer = ->
    self = this
    bufrw.toBuffer Frame.RW, self

Frame.Types = {}
