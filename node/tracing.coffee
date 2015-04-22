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

Tracing = (spanid, parentid, traceid, flags) ->
    self = this
    self.spanid = spanid or emptySpanId
    self.parentid = parentid or emptyParentId
    self.traceid = traceid or emptyTraceId
    self.flags = flags or 0
    return

tracingByteLength = ->
    bufrw.LengthResult.just 8 + 8 + 8 + 1

writeTracingInto = (tracing, buffer, offset) ->
    res = undefined
    res = fix8.writeInto(tracing.spanid, buffer, offset)
    if res.err
        return res
    offset = res.offset
    res = fix8.writeInto(tracing.parentid, buffer, offset)
    if res.err
        return res
    offset = res.offset
    res = fix8.writeInto(tracing.traceid, buffer, offset)
    if res.err
        return res
    offset = res.offset
    res = bufrw.UInt8.writeInto(tracing.flags, buffer, offset)
    res

readTracingFrom = (buffer, offset) ->
    tracing = new Tracing
    res = undefined
    res = fix8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    tracing.spanid = res.value
    res = fix8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    tracing.parentid = res.value
    res = fix8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    tracing.traceid = res.value
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    tracing.flags = res.value
    bufrw.ReadResult.just offset, tracing

'use strict'
bufrw = require('bufrw')
fix8 = bufrw.FixedWidth(8)
module.exports = Tracing
emptySpanId = Buffer(8)
emptyParentId = Buffer(8)
emptyTraceId = Buffer(8)
emptySpanId.fill 0
emptyParentId.fill 0
emptyTraceId.fill 0
Tracing.RW = bufrw.Base(tracingByteLength, readTracingFrom, writeTracingInto)
Tracing.emptyTracing = new Tracing
