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
# flags:1 csumtype:1 (csum:4){0,1} (arg~2)+

CallRequestCont = (flags, csum, args) ->
    self = this
    self.type = CallRequestCont.TypeCode
    self.flags = flags or 0
    self.csum = Checksum.objOrType(csum)
    self.args = args or []
    self.cont = null
    return

callReqContLength = (body) ->
    res = undefined
    length = 0
    # flags:1
    length += bufrw.UInt8.width
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body)
    if !res.err
        res.length += length
    res

readCallReqContFrom = (buffer, offset) ->
    res = undefined
    body = new CallRequestCont
    # flags:1
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.flags = res.value
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset)
    if !res.err
        res.value = body
    res

writeCallReqContInto = (body, buffer, offset) ->
    start = offset
    res = undefined
    # flags:1 -- skip for now, write args frist
    offset += bufrw.UInt8.width
    # csumtype:1 (csum:4){0,1} (arg~2)* -- (may mutate body.flags)
    res = argsrw.writeInto(body, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # now we know the final flags, write them
    res = bufrw.UInt8.writeInto(body.flags, buffer, start)
    if !res.err
        res.offset = offset
    res

# flags:1 csumtype:1 (csum:4){0,1} (arg~2)+

CallResponseCont = (flags, csum, args) ->
    self = this
    self.type = CallResponseCont.TypeCode
    self.flags = flags or 0
    self.csum = Checksum.objOrType(csum)
    self.args = args or []
    self.cont = null
    return

callResContLength = (body) ->
    res = undefined
    length = 0
    # flags:1
    length += bufrw.UInt8.width
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body)
    if !res.err
        res.length += length
    res

readCallResContFrom = (buffer, offset) ->
    res = undefined
    body = new CallResponseCont
    # flags:1
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.flags = res.value
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset)
    if !res.err
        res.value = body
    res

writeCallResContInto = (body, buffer, offset) ->
    start = offset
    res = undefined
    # flags:1 -- skip for now, write args frist
    offset += bufrw.UInt8.width
    # csumtype:1 (csum:4){0,1} (arg~2)* -- (may mutate body.flags)
    res = argsrw.writeInto(body, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # now we know the final flags, write them
    res = bufrw.UInt8.writeInto(body.flags, buffer, start)
    if !res.err
        res.offset = offset
    res

'use strict'
bufrw = require('bufrw')
Checksum = require('./checksum')
ArgsRW = require('./args')
argsrw = ArgsRW(bufrw.buf2)
CallRequestCont.TypeCode = 0x13
CallRequestCont.Cont = CallRequestCont
CallRequestCont.RW = bufrw.Base(callReqContLength, readCallReqContFrom, writeCallReqContInto)

CallRequestCont::verifyChecksum = (prior) ->
    self = this
    self.csum.verify self.args, prior

CallResponseCont.TypeCode = 0x14
CallResponseCont.Cont = CallResponseCont
CallResponseCont.RW = bufrw.Base(callResContLength, readCallResContFrom, writeCallResContInto)

CallResponseCont::verifyChecksum = (prior) ->
    self = this
    self.csum.verify self.args, prior

module.exports.RequestCont = CallRequestCont
module.exports.ResponseCont = CallResponseCont
