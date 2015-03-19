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

var test = require('tape');
var Checksum = require('../../v2/checksum.js');
var testRW = require('bufrw/test_rw');

var args = ['arg1', 'arg2', 'arg3'];
var parts = args.map(function mapArg(arg) {return Buffer(arg);});
var uparts = args.map(function mapArg(arg) {return Buffer(arg.toUpperCase());});

var CRC32Hash = 0x0812fa3f;
var Farm32Hash = 0xeed86ea9;

var NoneBytes = [
    Checksum.Types.None // csumtype:1
];

var CRC32Bytes = [
    Checksum.Types.CRC32,  // csumtype:1
    0x08, 0x12, 0xfa, 0x3f // csum:4
];

var Farm32Bytes = [
    Checksum.Types.Farm32, // csumtype:1
    0xee, 0xd8, 0x6e, 0xa9 // csum:4
];

test('Checksum: read/write', testRW.cases(Checksum.RW, [
    [Checksum(Checksum.Types.None), NoneBytes],
    [Checksum(Checksum.Types.CRC32, CRC32Hash), CRC32Bytes],
    [Checksum(Checksum.Types.Farm32, Farm32Hash), Farm32Bytes]
]));

test('verify none checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.None);
    var good = csum.verify(parts);
    assert.equal(good, null, 'none expected to verify parts');
    var bad = csum.verify(uparts);
    assert.equal(bad, null, 'none expected to accept anything');
    assert.end();
});

test('verify crc32 checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.CRC32, CRC32Hash);
    var good = csum.verify(parts);
    assert.equal(good, null, 'crc32 expected to verify parts');
    var bad = csum.verify(uparts);
    assert.equal(bad && bad.type, 'tchannel.checksum', 'crc32 expected to fail');
    assert.end();
});

test('read and verify farm32 checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.Farm32, Farm32Hash);
    var good = csum.verify(parts);
    assert.equal(good, null, 'farm32 expected to verify parts');
    var bad = csum.verify(uparts);
    assert.equal(bad && bad.type, 'tchannel.checksum', 'farm32 expected to fail');
    assert.end();
});
