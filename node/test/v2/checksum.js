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
var testRead = require('../lib/read_test.js');

var args = ['arg1', 'arg2', 'arg3'];
var parts = args.map(function mapArg(arg) {return Buffer(arg);});
var uparts = args.map(function mapArg(arg) {return Buffer(arg.toUpperCase());});

var NoneBuffer = Buffer([
    Checksum.Types.None // csumtype:1
]);

var CRC32Buffer = Buffer([
    Checksum.Types.CRC32,  // csumtype:1
    0x08, 0x12, 0xfa, 0x3f // csum:4
]);

var Farm32Buffer = Buffer([
    Checksum.Types.FarmHash32, // csumtype:1
    0x9b, 0x59, 0xe9, 0xf3     // csum:4
]);

test('read and verify none checksum', function t(assert) {
    testRead(assert, Checksum.read, NoneBuffer, function checkNone(csum, done) {
        assert.equal(csum.type, Checksum.Types.None, 'expected type: none');
        var good = csum.verify(parts[0], parts[1], parts[2]);
        assert.equal(good, null, 'none expected to verify parts');
        var bad = csum.verify(uparts[0], uparts[1], uparts[2]);
        assert.equal(bad, null, 'none expected to accept anything');
        done();
    });
});

test('read and verify crc32 checksum', function t(assert) {
    testRead(assert, Checksum.read, CRC32Buffer, function checkCRC32(csum, done) {
        assert.equal(csum.type, Checksum.Types.CRC32, 'expected type: crc32');
        var good = csum.verify(parts[0], parts[1], parts[2]);
        assert.equal(good, null, 'crc32 expected to verify parts');
        var bad = csum.verify(uparts[0], uparts[1], uparts[2]);
        assert.equal(bad && bad.type, 'tchannel.checksum', 'crc32 expected to fail');
        done();
    });
});

test('read and verify farmhash32 checksum', function t(assert) {
    testRead(assert, Checksum.read, Farm32Buffer, function checkFarmHash32(csum, done) {
        assert.equal(csum.type, Checksum.Types.FarmHash32, 'expected type: farmhash32');
        var good = csum.verify(parts[0], parts[1], parts[2]);
        assert.equal(good, null, 'farmhash32 expected to verify parts');
        var bad = csum.verify(uparts[0], uparts[1], uparts[2]);
        assert.equal(bad && bad.type, 'tchannel.checksum', 'farmhash32 expected to fail');
        done();
    });
});

test('write correct none checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.None);
    csum.update(parts[0], parts[1], parts[2]);
    assert.deepEqual(
        csum.write().create(),
        NoneBuffer, 'none writes correct checksum');
    csum.update(uparts[0], uparts[1], uparts[2]);
    assert.deepEqual(
        csum.write().create(),
        NoneBuffer, 'none does not care');
    assert.end();
});

test('write correct crc32 checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.CRC32);
    csum.update(parts[0], parts[1], parts[2]);
    assert.deepEqual(
        csum.write().create(),
        CRC32Buffer, 'crc32 writes correct checksum');
    csum.update(uparts[0], uparts[1], uparts[2]);
    assert.notDeepEqual(
        csum.write().create(),
        CRC32Buffer, 'crc32 rejects bad data');
    assert.end();
});

test('write correct farmhash32 checksum', function t(assert) {
    var csum = Checksum(Checksum.Types.FarmHash32);
    csum.update(parts[0], parts[1], parts[2]);
    assert.deepEqual(
        csum.write().create(),
        Farm32Buffer, 'farmhash32 writes correct checksum');
    csum.update(uparts[0], uparts[1], uparts[2]);
    assert.notDeepEqual(
        csum.write().create(),
        Farm32Buffer, 'farmhash32 rejects bad data');
    assert.end();
});
