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
# TODO: validate transport header names?
# TODO: Checksum-like class for tracing

### jshint maxparams:10 ###

# flags:1 ttl:4 tracing:24 traceflags:1 service~1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*

CallRequest = (flags, ttl, tracing, service, headers, csum, args) ->
    self = this
    self.type = CallRequest.TypeCode
    self.flags = flags or 0
    self.ttl = ttl or 0
    self.tracing = tracing or Tracing.emptyTracing
    self.service = service or ''
    self.headers = headers or {}
    self.csum = Checksum.objOrType(csum)
    self.args = args or []
    self.cont = null
    return

callReqLength = (body) ->
    res = undefined
    length = 0
    # flags:1
    length += bufrw.UInt8.width
    # ttl:4
    length += bufrw.UInt32BE.width
    # tracing:24 traceflags:1
    res = Tracing.RW.byteLength(body.tracing)
    if res.err
        return res
    length += res.length
    # service~1
    res = bufrw.str1.byteLength(body.service)
    if res.err
        return res
    length += res.length
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.byteLength(body.headers)
    if res.err
        return res
    length += res.length
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body)
    if !res.err
        res.length += length
    res

readCallReqFrom = (buffer, offset) ->
    res = undefined
    body = new CallRequest
    # flags:1
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.flags = res.value
    # ttl:4
    res = bufrw.UInt32BE.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.ttl = res.value
    # tracing:24 traceflags:1
    res = Tracing.RW.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.tracing = res.value
    # service~1
    res = bufrw.str1.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.service = res.value
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.headers = res.value
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset)
    if !res.err
        res.value = body
    res

writeCallReqInto = (body, buffer, offset) ->
    start = offset
    res = undefined
    # flags:1 -- filled in later after argsrw
    offset += bufrw.UInt8.width
    # ttl:4
    res = bufrw.UInt32BE.writeInto(body.ttl, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # tracing:24 traceflags:1
    res = Tracing.RW.writeInto(body.tracing, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # service~1
    res = bufrw.str1.writeInto(body.service, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.writeInto(body.headers, buffer, offset)
    if res.err
        return res
    offset = res.offset
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

# flags:1 code:1 tracing:24 traceflags:1 nh:1 (hk~1 hv~1){nh} csumtype:1 (csum:4){0,1} (arg~2)*

CallResponse = (flags, code, tracing, headers, csum, args) ->
    self = this
    self.type = CallResponse.TypeCode
    self.flags = flags or 0
    self.code = code or CallResponse.Codes.OK
    self.tracing = tracing or Tracing.emptyTracing
    self.headers = headers or {}
    self.csum = Checksum.objOrType(csum)
    self.args = args or []
    self.cont = null
    return

callResLength = (body) ->
    res = undefined
    length = 0
    # flags:1
    length += bufrw.UInt8.width
    # code:1
    length += bufrw.UInt8.width
    # tracing:24 traceflags:1
    res = Tracing.RW.byteLength(body.tracing)
    if res.err
        return res
    length += res.length
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.byteLength(body.headers)
    if res.err
        return res
    length += res.length
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.byteLength(body)
    if !res.err
        res.length += length
    res

readCallResFrom = (buffer, offset) ->
    res = undefined
    body = new CallResponse
    # flags:1
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.flags = res.value
    # code:1
    res = bufrw.UInt8.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.code = res.value
    # tracing:24 traceflags:1
    res = Tracing.RW.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.tracing = res.value
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    body.headers = res.value
    # csumtype:1 (csum:4){0,1} (arg~2)*
    res = argsrw.readFrom(body, buffer, offset)
    if !res.err
        res.value = body
    res

writeCallResInto = (body, buffer, offset) ->
    start = offset
    res = undefined
    # flags:1 -- filled in later after argsrw
    offset += bufrw.UInt8.width
    # code:1
    res = bufrw.UInt8.writeInto(body.code, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # tracing:24 traceflags:1
    res = Tracing.RW.writeInto(body.tracing, buffer, offset)
    if res.err
        return res
    offset = res.offset
    # nh:1 (hk~1 hv~1){nh}
    res = header.header1.writeInto(body.headers, buffer, offset)
    if res.err
        return res
    offset = res.offset
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
ArgsRW = require('./args')
Checksum = require('./checksum')
header = require('./header')
Tracing = require('./tracing')
argsrw = ArgsRW()
ResponseCodes = 
    OK: 0x00
    Error: 0x01
module.exports.Request = CallRequest
module.exports.Response = CallResponse
CallRequest.Cont = require('./cont').RequestCont
CallRequest.TypeCode = 0x03
CallRequest.RW = bufrw.Base(callReqLength, readCallReqFrom, writeCallReqInto)

CallRequest::verifyChecksum = ->
    self = this
    self.csum.verify self.args

CallResponse.Cont = require('./cont').ResponseCont
CallResponse.TypeCode = 0x04
CallResponse.Codes = ResponseCodes
CallResponse.RW = bufrw.Base(callResLength, readCallResFrom, writeCallResInto)

CallResponse::verifyChecksum = ->
    self = this
    self.csum.verify self.args
