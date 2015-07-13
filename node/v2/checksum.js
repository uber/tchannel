// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var assert = require('assert');
var farm32 = require('farmhash').fingerprint32;
var crc32 = require('crc').crc32;
var crc32c = require('sse4_crc32').calculate;
var bufrw = require('bufrw');
var errors = require('../errors');

module.exports = Checksum;

// csumtype:1 (csum:4){0,1}
function Checksum(type, val) {
    var self = this;
    self.type = type;
    self.val = val || 0;
}

function fetchCompute(csum) {
    switch (csum.type) {
        case 0x00:
            return Checksum._computeNone;
        case 0x01:
            return Checksum._computeCrc32;
        case 0x02:
            return Checksum._computeFarm32;
        case 0x03:
            return Checksum._computeCrc32C;
        default:
            assert(false, 'invalid checksum type ' + csum.type);
    }
}

Checksum.objOrType = function objOrType(arg) {
    if (arg instanceof Checksum) {
        return arg;
    }
    if (arg === undefined || arg === null) {
        return new Checksum(Checksum.Types.None);
    }
    assert(typeof arg === 'number',
           'expected a Checksum object or a valid checksum type');
    switch (arg) {
        case 0x00:
        case 0x01:
        case 0x02:
        case 0x03:
            return new Checksum(arg);
        default:
            assert(false, 'expected a Checksum object or a valid checksum type');
    }
};

Checksum.Types = Object.create(null);
Checksum.Types.None = 0x00;
Checksum.Types.CRC32 = 0x01;
Checksum.Types.Farm32 = 0x02;
Checksum.Types.CRC32C = 0x03;

// csumtype:1 (csum:4){0,1}

var rwCases = Object.create(null);
rwCases[Checksum.Types.None] = bufrw.Null;
rwCases[Checksum.Types.CRC32] = bufrw.UInt32BE;
rwCases[Checksum.Types.Farm32] = bufrw.UInt32BE;
rwCases[Checksum.Types.CRC32C] = bufrw.UInt32BE;

Checksum.RW = bufrw.Switch(bufrw.UInt8, rwCases, {
    cons: Checksum,
    valKey: 'type',
    dataKey: 'val'
});

Checksum.compute = function compute(csum, args, prior) {
    if (typeof prior !== 'number') prior = 0;
    if (csum.type === Checksum.Types.None) {
        return 0;
    } else {
        var _compute = fetchCompute(csum);

        var _csum = prior;
        for (var i = 0; i < args.length; i++) {
            _csum = _compute(args[i], _csum);
        }
        return _csum;
    }
};

Checksum._computeNone = function _computeNone() {
    return 0;
};

Checksum._computeCrc32 = function _computeCrc32(arg, prior) {
    if (prior === 0) prior = undefined;
    return crc32(arg, prior);
};

Checksum._computeCrc32C = function _computeCrc32C(arg, prior) {
    return crc32c(arg, prior);
};

Checksum._computeFarm32 = function _computeFarm32(arg, prior) {
    return farm32(arg, prior);
};

Checksum.update1 = function update1(csum, arg, prior) {
    var _compute = fetchCompute(csum);

    csum.val = _compute(arg, prior);
};

// Checksum.prototype.update = function update(args, prior) {
//     var self = this;
//     self.val = self.compute(args, prior);
// };

Checksum.verify = function verify(csum, args, prior) {
    if (csum.type === Checksum.Types.None) {
        return null;
    }
    var val = Checksum.compute(csum, args, prior);
    if (val === csum.val) {
        return null;
    } else {
        return errors.ChecksumError({
            checksumType: csum.type,
            expectedValue: csum.val,
            actualValue: val
        });
    }
};
