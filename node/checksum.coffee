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
# csumtype:1 (csum:4){0,1}

Checksum = (type, val) ->
    self = this
    self.type = type
    self.val = val or 0
    switch self.type
        when 0x00
            self._compute = self._computeNone
        when 0x01
            self._compute = self._computeCrc32
        when 0x02
            self._compute = self._computeFarm32
        when 0x03
            self._compute = self._computeCrc32C
        else
            assert false, 'invalid checksum type ' + self.type
    return

'use strict'
assert = require('assert')
farm32 = require('farmhash').fingerprint32
crc32 = require('crc').crc32
crc32c = require('sse4_crc32').calculate
bufrw = require('bufrw')
errors = require('../errors')
module.exports = Checksum

Checksum.objOrType = (arg) ->
    if arg instanceof Checksum
        return arg
    if arg == undefined or arg == null
        return new Checksum(Checksum.Types.None)
    assert typeof arg == 'number', 'expected a Checksum object or a valid checksum type'
    switch arg
        when 0x00, 0x01, 0x02, 0x03
            return new Checksum(arg)
        else
            assert false, 'expected a Checksum object or a valid checksum type'
    return

Checksum.Types = Object.create(null)
Checksum.Types.None = 0x00
Checksum.Types.CRC32 = 0x01
Checksum.Types.Farm32 = 0x02
Checksum.Types.CRC32C = 0x03
# csumtype:1 (csum:4){0,1}
rwCases = Object.create(null)
rwCases[Checksum.Types.None] = bufrw.Null
rwCases[Checksum.Types.CRC32] = bufrw.UInt32BE
rwCases[Checksum.Types.Farm32] = bufrw.UInt32BE
rwCases[Checksum.Types.CRC32C] = bufrw.UInt32BE
Checksum.RW = bufrw.Switch(bufrw.UInt8, rwCases,
    cons: Checksum
    valKey: 'type'
    dataKey: 'val')

Checksum::compute = (args, prior) ->
    if typeof prior != 'number'
        prior = 0
    self = this
    if self.type == Checksum.Types.None
        0
    else
        csum = prior
        i = 0
        while i < args.length
            csum = self._compute(args[i], csum)
            i++
        csum

Checksum::_computeNone = ->
    0

Checksum::_computeCrc32 = (arg, prior) ->
    if prior == 0
        prior = undefined
    crc32 arg, prior

Checksum::_computeCrc32C = (arg, prior) ->
    crc32c arg, prior

Checksum::_computeFarm32 = (arg, prior) ->
    farm32 arg, prior

Checksum::update1 = (arg, prior) ->
    self = this
    self.val = self._compute(arg, prior)
    return

Checksum::update = (args, prior) ->
    self = this
    self.val = self.compute(args, prior)
    return

Checksum::verify = (args, prior) ->
    self = this
    if self.type == Checksum.Types.None
        return null
    val = self.compute(args, prior)
    if val == self.val
        null
    else
        errors.ChecksumError
            checksumType: self.type
            expectedValue: self.val
            actualValue: val
