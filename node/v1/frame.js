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

var farmhash = require('farmhash');
var Header = require('./header');

var emptyBuffer = Buffer(0);

module.exports = TChannelFrame;

function TChannelFrame() {
    this.header = new Header();
    // TODO this field is unused. It should be removed.
    this.options = null;
    this.arg1 = null;
    this.arg2 = null;
    this.arg3 = null;
}

TChannelFrame.prototype.set = function (arg1, arg2, arg3) {
    if (arg1 === undefined || arg1 === null) {
        arg1 = '';
    }
    if (arg2 === undefined || arg2 === null) {
        arg2 = '';
    }
    if (arg3 === undefined || arg3 === null) {
        arg3 = '';
    }

    if (Buffer.isBuffer(arg1)) {
        this.arg1 = arg1;
    } else {
        this.arg1 = new Buffer(arg1.toString());
    }
    this.header.arg1len = this.arg1.length;

    if (Buffer.isBuffer(arg2)) {
        this.arg2 = arg2;
    } else if (typeof arg2 === 'string') {
        this.arg2 = new Buffer(arg2);
    } else if (arg2 === null || arg2 === undefined) {
        this.arg2 = emptyBuffer;
    } else {
        throw new Error('arg2 must be a buffer or string');
    }
    this.header.arg2len = this.arg2.length;

    if (Buffer.isBuffer(arg3)) {
        this.arg3 = arg3;
    } else if (typeof arg3 === 'string') {
        this.arg3 = new Buffer(arg3);
    } else if (arg3 === null || arg3 === undefined) {
        this.arg3 = emptyBuffer;
    } else {
        throw new Error('arg3 must be a buffer or string');
    }
    this.header.arg3len = this.arg3.length;
    this.header.csum = this.checksum();
};

TChannelFrame.prototype.checksum = function () {
    var csum = farmhash.hash32(this.arg1);
    if (this.arg2.length > 0) {
        csum = farmhash.hash32WithSeed(this.arg2, csum);
    }
    if (this.arg3.length > 0) {
        csum = farmhash.hash32WithSeed(this.arg3, csum);
    }
    return csum;
};

TChannelFrame.prototype.verifyChecksum = function () {
    var self = this;
    var err = null;
    var actual = self.checksum();
    var expected = self.header.csum;
    if (expected !== actual) {
        err = new Error('tchannel checksum validation failed');
        err.actual = actual;
        err.expected = expected;
    }
    return err;
};

TChannelFrame.prototype.toBuffer = function () {
    var header = this.header;
    var buf = new Buffer(25 + header.arg1len + header.arg2len + header.arg3len);
    var offset = 0;

    buf.writeUInt8(header.type, offset, true);
    offset += 1;
    buf.writeUInt32BE(header.id, offset, true);
    offset += 4;
    buf.writeUInt32BE(header.seq, offset, true);
    offset += 4;
    buf.writeUInt32BE(header.arg1len, offset, true);
    offset += 4;
    buf.writeUInt32BE(header.arg2len, offset, true);
    offset += 4;
    buf.writeUInt32BE(header.arg3len, offset, true);
    offset += 4;
    buf.writeUInt32BE(header.csum, offset, true);
    offset += 4;

    this.arg1.copy(buf, offset);
    offset += this.arg1.length;
    this.arg2.copy(buf, offset);
    offset += this.arg2.length;
    this.arg3.copy(buf, offset);
    offset += this.arg3.length;

    return buf;
};
