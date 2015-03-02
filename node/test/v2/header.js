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
var testRead = require('../lib/read_test.js');
var Header = require('../../v2/header.js');

var testEmpty = Buffer([
    0x00 // nh:1
]);

var testSingle = Buffer([
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
    0x03, 0x76, 0x61, 0x6c  // hv~1 "val"
]);

var testThree = Buffer([
    0x03,                   // nh:1
    0x03, 0x72, 0x65, 0x64, // hk~1 "red"
    0x05, 0x67, 0x72, 0x65, // hv~1 "green"
    0x65, 0x6e,             // ...
    0x04, 0x62, 0x6c, 0x75, // hk~1 "blue"
    0x65,                   // ...
    0x06, 0x79, 0x65, 0x6c, // hv~1 "yellow"
    0x6c, 0x6f, 0x77,       // ...
    0x07, 0x6d, 0x61, 0x67, // hk~1 "magenta"
    0x65, 0x6e, 0x74, 0x61, // ...
    0x04, 0x63, 0x79, 0x61, // hv~1 "cyan"
    0x6e                    // ...
]);

var dupKeyBuffer = Buffer([
    0x02,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
    0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
    0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
    0x03, 0x56, 0x41, 0x4c  // hv~1 "VAL"
]);

var testNullKey = Buffer([
    0x01,             // nh:1
    0x00,             // hk~1 ""
    0x02, 0x65, 0x6b, // hv~1 "ek"
]);

var testNullVal = Buffer([
    0x01,             // nh:1
    0x02, 0x65, 0x76, // hk~1 "ev"
    0x00              // hv~1 ""
]);

var testNHTooSmall = Buffer([
    0x01,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
    0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
    0x03, 0x63, 0x61, 0x74, // hk~1 "cat"
    0x03, 0x64, 0x6f, 0x67  // hv~1 "dog"
]);

var testNHTooLarge = Buffer([
    0x03,                   // nh:1
    0x03, 0x6b, 0x65, 0x79, // hk~1 "key"
    0x03, 0x76, 0x61, 0x6c, // hv~1 "val"
    0x03, 0x63, 0x61, 0x74, // hk~1 "cat"
    0x03, 0x64, 0x6f, 0x67  // hv~1 "dog"
]);

test('read empty headers', function t(assert) {
    testRead(assert, Header.read, testEmpty, function s(headers, done) {
        var keys = Object.keys(headers);
        assert.equal(keys.length, 0, 'expected empty headers');
        done();
    });
});

test('read singeton headers', function t(assert) {
    testRead(assert, Header.read, testSingle, function s(headers, done) {
        var keys = Object.keys(headers);
        assert.deepEqual(keys, ['key'], 'expected one header');
        assert.equal(headers.key, 'val', 'expected key => val');
        done();
    });
});

test('read three headers', function t(assert) {
    testRead(assert, Header.read, testThree, function s(headers, done) {
        var keys = Object.keys(headers);
        assert.deepEqual(keys, ['red', 'blue', 'magenta'], 'expected one header');
        assert.equal(headers.red, 'green', 'expected red => green');
        assert.equal(headers.blue, 'yellow', 'expected blue => yellow');
        assert.equal(headers.magenta, 'cyan', 'expected magenta => cyan');
        done();
    });
});

test('read duplicate key -> error', function t(assert) {
    testRead.shouldError(assert, Header.read, dupKeyBuffer, function s(err, done) {
        assert.equal(err.type, 'tchannel.duplicate-header-key', 'expected duplicate key error');
        assert.equal(err.key, 'key');
        assert.equal(err.value, 'VAL');
        assert.equal(err.priorValue, 'val');
        done();
    });
});

test('read null key', function t(assert) {
    testRead.shouldError(assert, Header.read, testNullKey, function s(err, done) {
        assert.equal(err.type, 'tchannel.null-key', 'expected duplicate key error');
        // TODO: should be 0x01, but pair already read by time error guard gets
        // a chance
        assert.equal(err.offset, 0x05, 'expected duplicate key error');
        done();
    });
});

test('read null val', function t(assert) {
    testRead(assert, Header.read, testNullVal, function s(headers, done) {
        var keys = Object.keys(headers);
        assert.deepEqual(keys, ['ev'], 'expected one header');
        assert.equal(headers.ev, '', 'expected "ev" => ""');
        done();
    });
});

test('read NH too small', function t(assert) {
    testRead.shouldError(assert, Header.read, testNHTooSmall, function s(err, done) {
        assert.equal(err.type, 'short-read', 'expected duplicate key error');
        assert.equal(err.offset, 9, 'expected stopped after first key => val');
        done();
    });
});

test('read NH too large', function t(assert) {
    testRead.shouldError(assert, Header.read, testNHTooLarge, function s(err, done) {
        assert.equal(err.type, 'tchannel.short-buffer', 'expected duplicate key error');
        assert.equal(err.offset, 17, 'expected failed at end of buffer');
        assert.equal(err.expected, 1, 'expected to be looking for nh:1');
        done();
    });
});

test('write empty headers', function t(assert) {
    var headers = {};
    assert.deepEqual(
        Header.write(headers).create(), testEmpty,
        'expected write output');
    assert.end();
});

test('write singleton headers', function t(assert) {
    var headers = {key: 'val'};
    assert.deepEqual(
        Header.write(headers).create(), testSingle,
        'expected write output');
    assert.end();
});

test('write three headers', function t(assert) {
    var headers = {
        red: 'green',
        blue: 'yellow',
        magenta: 'cyan'
    };
    assert.deepEqual(
        Header.write(headers).create(), testThree,
        'expected write output');
    assert.end();
});
