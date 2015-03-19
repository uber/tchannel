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

var farm32 = require('farmhash').fingerprint32;
var crc32 = require('crc').crc32;
var bufrw = require('bufrw');
var TypedError = require('error/typed');

var ChecksumError = TypedError({
    type: 'tchannel.checksum',
    message: 'invalid checksum',
    checksumType: null,
    expectedValue: null,
    actualValue: null
});

module.exports = Checksum;

// csumtype:1 (csum:4){0,1}
function Checksum(type, val) {
    if (!(this instanceof Checksum)) {
        return new Checksum(type, val);
    }
    var self = this;
    self.type = type;
    self.val = val || 0;
}

Checksum.objOrType = function objOrType(arg) {
    if (arg instanceof Checksum) {
        return arg;
    }
    if (typeof arg !== 'number') {
        throw new Error('expected a Checksum object or a valid checksum type');
    }
    switch (arg) {
        case 0x00:
        case 0x01:
        case 0x02:
            return Checksum(arg);
        default:
            throw new Error('invalid checsum type');
    }
};

Checksum.Types = Object.create(null);
Checksum.Types.None = 0x00;
Checksum.Types.CRC32 = 0x01;
Checksum.Types.Farm32 = 0x02;

// csumtype:1 (csum:4){0,1}

var rwCases = Object.create(null);
rwCases[Checksum.Types.None] = bufrw.Null;
rwCases[Checksum.Types.CRC32] = bufrw.UInt32BE;
rwCases[Checksum.Types.Farm32] = bufrw.UInt32BE;

Checksum.RW = bufrw.Switch(bufrw.UInt8, rwCases, {
    cons: Checksum,
    valKey: 'type',
    dataKey: 'val'
});

Checksum.prototype.compute = function compute(args, prior) {
    if (typeof prior !== 'number') prior = 0;
    var self = this;
    var csum = prior;
    var i;
    switch (self.type) {
        case 0x00:
            break;
        case 0x01:
            for (i = 0; i < args.length; i++) {
                csum = crc32(args[i], csum);
            }
            break;
        case 0x02:
            for (i = 0; i < args.length; i++) {
                csum = farm32(args[i], csum);
            }
            break;
        default:
            throw new Error('invalid checksum type ' + self.type);
    }
    return csum;
};

Checksum.prototype.update = function update(args, prior) {
    var self = this;
    self.val = self.compute(args, prior);
};

Checksum.prototype.verify = function verify(args, prior) {
    var self = this;
    if (self.type === Checksum.Types.None) {
        return null;
    }
    var val = self.compute(args, prior);
    if (val === self.val) {
        return null;
    } else {
        return ChecksumError({
            checksumType: self.type,
            expectedValue: self.val,
            actualValue: val
        });
    }
};
