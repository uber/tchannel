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

ArgRW = (sizerw) ->
    if !(this instanceof ArgRW)
        return new ArgRW(sizerw)
    self = this
    Base.call self
    self.sizerw = sizerw
    self.strrw = bufrw.String(self.sizerw, 'utf8')
    self.bufrw = bufrw.VariableBuffer(self.sizerw)
    return

ArgsRW = (argrw) ->
    if !(this instanceof ArgsRW)
        return new ArgsRW(argrw)
    argrw = argrw or arg2
    assert argrw.sizerw and argrw.sizerw.width, 'invalid argrw'
    self = this
    bufrw.Base.call self
    self.argrw = argrw
    self.overhead = self.argrw.sizerw.width
    return

'use strict'
assert = require('assert')
inherits = require('util').inherits
bufrw = require('bufrw')
Checksum = require('./checksum')
Flags = require('./call_flags')
errors = require('../errors')
Base = bufrw.Base
LengthResult = bufrw.LengthResult
WriteResult = bufrw.WriteResult
ReadResult = bufrw.ReadResult

ArgRW::byteLength = (arg) ->
    self = this
    if typeof arg == 'string'
        self.strrw.byteLength arg
    else
        self.bufrw.byteLength arg

ArgRW::writeInto = (arg, buffer, offset) ->
    self = this
    if typeof arg == 'string'
        self.strrw.writeInto arg, buffer, offset
    else
        self.bufrw.writeInto arg, buffer, offset

ArgRW::readFrom = (buffer, offset) ->
    self = this
    self.bufrw.readFrom buffer, offset

arg2 = ArgRW(bufrw.UInt16BE)
inherits ArgsRW, bufrw.Base

ArgsRW::byteLength = (body) ->
    self = this
    length = 0
    res = undefined
    res = Checksum.RW.byteLength(body.csum)
    if res.err
        return res
    length += res.length
    if body.args == null
        return LengthResult.just(length)
    if !Array.isArray(body.args)
        return LengthResult.error(errors.InvalidArgumentError(
            argType: typeof body.args
            argConstructor: body.args.constructor.name))
    i = 0
    while i < body.args.length
        res = self.argrw.byteLength(body.args[i])
        if res.err
            return res
        length += res.length
        i++
    LengthResult.just length

ArgsRW::writeInto = (body, buffer, offset) ->
    self = this
    start = offset
    res = undefined
    lenres = Checksum.RW.byteLength(body.csum)
    if lenres.err
        return WriteResult.error(lenres.err)
    offset += lenres.length
    if body.cont == null
        res = self.writeFragmentInto(body, buffer, offset)
        if res.err
            return res
        offset = res.offset
    else
        # assume that something else already did the fragmentation correctly
        i = 0
        while i < body.args.length
            res = self.argrw.writeInto(body.args[i], buffer, offset)
            if res.err
                return res
            buf = buffer.slice(offset + self.overhead, res.offset)
            body.csum.update1 buf, body.csum.val
            offset = res.offset
            i++
    res = Checksum.RW.writeInto(body.csum, buffer, start)
    if !res.err
        res.offset = offset
    res

ArgsRW::readFrom = (body, buffer, offset) ->
    self = this
    res = undefined
    # TODO: missing symmetry: verify csum (requires prior somehow)
    res = Checksum.RW.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.csum = res.value
    body.args = []
    while offset < buffer.length
        res = self.argrw.readFrom(buffer, offset)
        if res.err
            return res
        offset = res.offset
        body.args.push res.value
    ReadResult.just offset, body

ArgsRW::writeFragmentInto = (body, buffer, offset) ->
    self = this
    res = undefined
    i = 0
    remain = buffer.length - offset
    loop
        arg = body.args[i] or Buffer(0)
        min = if self.overhead + arg.length then 1 else 0
        if remain < min
            break
        need = self.overhead + arg.length
        if need > remain
            j = remain - self.overhead
            body.args[i] = arg.slice(0, j)
            body.cont = new (body.constructor.Cont)(body.flags & Flags.Fragment, body.csum, body.args.splice(i + 1))
            body.cont.args.unshift arg.slice(j)
            body.flags |= Flags.Fragment
            arg = body.args[i]
        res = self.argrw.writeInto(arg, buffer, offset)
        if res.err
            return res
        buf = buffer.slice(offset + self.overhead, res.offset)
        body.csum.update1 buf, body.csum.val
        offset = res.offset
        remain = buffer.length - offset
        unless remain >= self.overhead and ++i < body.args.length
            break
    res or WriteResult.just(offset)

module.exports = ArgsRW
module.exports.ArgRW = ArgRW
