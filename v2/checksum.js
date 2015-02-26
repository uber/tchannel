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

var farm32 = require('farmhash').hash32;
var crc32 = require('crc').crc32;

var TypedError = require('error/typed');
var read = require('../lib/read');
var write = require('../lib/write');

var ChecksumError = TypedError({
    type: 'tchannel.checksum-error',
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

Checksum.Types = {
    None: 0x00,
    CRC32: 0x01,
    FarmHash32: 0x02
};

Checksum.read = read.chained(read.UInt8, function(type, buffer, offset) {
    switch (type) {
        case 0x00:
            return build(0, buffer, offset);
        case 0x01:
        case 0x02:
            return read.chain(read.UInt32BE, buffer, offset, build);
        default:
            var err = new Error('invalid checksum type ' + type);
            return [err, offset - 1, null];
    }
    function build(val, buffer, offset) {
        var csum = new Checksum(type, val);
        return [null, offset, csum];
    }
});

// csumtype:1 (csum:4){0,1}
Checksum.prototype.write = function writeChecksum() {
    var self = this;
    var type = write.UInt8(self.type);
    switch (self.type) {
        case 0x00:
            return type;
        case 0x01:
        case 0x02:
            return write.series([type, write.UInt32BE(self.val)]);
        default:
            throw new Error('invalid checksum type ' + self.type);
    }
};

Checksum.prototype.compute = function compute(arg1, arg2, arg3) {
    var self = this;
    var csum = 0;
    switch (self.type) {
        case 0x00:
            break;
        case 0x01:
            csum = crc32(arg1, 0);
            csum = crc32(arg2, csum);
            csum = crc32(arg3, csum);
            break;
        case 0x02:
            csum = farm32(arg1, 0);
            csum = farm32(arg2, csum);
            csum = farm32(arg3, csum);
            break;
        default:
            throw new Error('invalid checksum type ' + self.type);
    }
    return csum;
};

Checksum.prototype.update = function update(arg1, arg2, arg3) {
    var self = this;
    self.val = self.compute(arg1, arg2, arg3);
};

Checksum.prototype.verify = function verify(arg1, arg2, arg3) {
    var self = this;
    if (self.type === Checksum.Types.None) {
        return null;
    }
    var val = self.compute(arg1, arg2, arg3);
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
