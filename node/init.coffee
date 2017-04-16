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

InitRequest = (version, headers) ->
    self = this
    self.type = InitRequest.TypeCode
    self.version = version or 0
    self.headers = headers or {}
    return

# TODO: MissingInitHeaderError check / guard

InitResponse = (version, headers) ->
    self = this
    self.type = InitResponse.TypeCode
    self.version = version or 0
    self.headers = headers or {}
    return

writeFieldGuard = (initBody, buffer, offset) ->
    err = requiredFieldGuard(initBody.headers)
    if err
        WriteResult.error err, offset
    else
        WriteResult.just offset

readFieldGuard = (initBody, buffer, offset) ->
    err = requiredFieldGuard(initBody.headers)
    if err
        ReadResult.error err, offset
    else
        ReadResult.just offset

requiredFieldGuard = (headers) ->
    i = 0
    while i < RequiredHeaderFields.length
        field = RequiredHeaderFields[i]
        if headers[field] == undefined
            return errors.MissingInitHeaderError(field: field)
        i++
    null

'use strict'
bufrw = require('bufrw')
WriteResult = bufrw.WriteResult
ReadResult = bufrw.ReadResult
header = require('./header')
errors = require('../errors')
module.exports.Request = InitRequest
module.exports.Response = InitResponse
RequiredHeaderFields = [
    'host_port'
    'process_name'
]
InitRequest.TypeCode = 0x01
InitRequest.RW = bufrw.Struct(InitRequest, [
    { call: writeInto: writeFieldGuard }
    {
        name: 'version'
        rw: bufrw.UInt16BE
    }
    {
        name: 'headers'
        rw: header.header2
    }
    { call: readFrom: readFieldGuard }
])
InitResponse.TypeCode = 0x02
InitResponse.RW = bufrw.Struct(InitResponse, [
    { call: writeInto: writeFieldGuard }
    {
        name: 'version'
        rw: bufrw.UInt16BE
    }
    {
        name: 'headers'
        rw: header.header2
    }
    { call: readFrom: readFieldGuard }
])
