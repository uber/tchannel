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
# TODO: different struct pattern that doesn't realize a temporary list of
# [key, val] tuples may be better. At the very least, such structure would
# allow for more precise error reporting.

HeaderRW = (countrw, keyrw, valrw) ->
    if !(this instanceof HeaderRW)
        return new HeaderRW(countrw, keyrw, valrw)
    self = this
    self.countrw = countrw
    self.keyrw = keyrw
    self.valrw = valrw
    bufrw.Base.call self
    return

'use strict'
bufrw = require('bufrw')
inherits = require('util').inherits
errors = require('../errors')
inherits HeaderRW, bufrw.Base

HeaderRW::byteLength = (headers) ->
    self = this
    length = 0
    keys = Object.keys(headers)
    res = undefined
    length += self.countrw.width
    i = 0
    while i < keys.length
        key = keys[i]
        res = self.keyrw.byteLength(key)
        if res.err
            return res
        length += res.length
        res = self.valrw.byteLength(headers[key])
        if res.err
            return res
        length += res.length
        i++
    bufrw.LengthResult.just length

HeaderRW::writeInto = (headers, buffer, offset) ->
    self = this
    keys = Object.keys(headers)
    res = undefined
    res = self.countrw.writeInto(keys.length, buffer, offset)
    i = 0
    while i < keys.length
        if res.err
            return res
        offset = res.offset
        key = keys[i]
        res = self.keyrw.writeInto(key, buffer, offset)
        if res.err
            return res
        offset = res.offset
        res = self.valrw.writeInto(headers[key], buffer, offset)
        i++
    res

HeaderRW::readFrom = (buffer, offset) ->
    self = this
    headers = {}
    start = 0
    n = 0
    key = ''
    val = ''
    res = undefined
    res = self.countrw.readFrom(buffer, offset)
    if res.err
        return res
    offset = res.offset
    n = res.value
    i = 0
    while i < n
        start = offset
        res = self.keyrw.readFrom(buffer, offset)
        if res.err
            return res
        key = res.value
        if !key.length
            return bufrw.ReadResult.error(errors.NullKeyError(
                offset: offset
                endOffset: res.offset), offset, headers)
        offset = res.offset
        res = self.valrw.readFrom(buffer, offset)
        if res.err
            return res
        val = res.value
        if headers[key] != undefined
            return bufrw.ReadResult.error(errors.DuplicateHeaderKeyError(
                offset: start
                endOffset: res.offset
                key: key
                value: val
                priorValue: headers[key]), offset, headers)
        offset = res.offset
        headers[key] = val
        i++
    bufrw.ReadResult.just offset, headers

module.exports = HeaderRW
# nh:1 (hk~1 hv~1){nh}
module.exports.header1 = HeaderRW(bufrw.UInt8, bufrw.str1, bufrw.str1)
# nh:2 (hk~2 hv~2){nh}
module.exports.header2 = HeaderRW(bufrw.UInt16BE, bufrw.str2, bufrw.str2)
