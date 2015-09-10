// Copyright (c) 2015 Uber Technologies, Inc.
//
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

var Result = require('rezult');
var test = require('tape');

var Errors = require('../../../lib/larch/errors');

test('resultArrayToError with no errors', function t1(assert) {
    var array = [
        new Result(null, 'foo'),
        new Result(null, 'bar'),
        new Result(null, 'baz')
    ];

    var err = Errors.resultArrayToError(array, 'thing.error');

    assert.ok(err === null, 'returns null');

    assert.end();
});

test('resultArrayToError with 1 error', function t2(assert) {
    var didntWorkErr = new Error('didnt work');

    var array = [
        new Result(null, 'asdf'),
        new Result(didntWorkErr),
        new Result(null, 'asdfsdsf'),
        new Result(null, 'jkl')
    ];

    var err = Errors.resultArrayToError(array, 'thing.error');

    assert.ok(err === didntWorkErr, 'returns the one error');

    assert.end();
});

test('resultArrayToError with some errors', function t3(assert) {
    var err1 = new Error('foobar');
    var err2 = new Error('timeout');

    var array = [
        new Result(null, 'foo'),
        new Result(err1),
        new Result(null, 'bar'),
        new Result(null, 'foobar'),
        new Result(err2)
    ];

    var err = Errors.resultArrayToError(array, 'thing.error');

    assert.ok(err.type === 'thing.error', 'error type is right');
    assert.ok(err.message === '2 errors. Example: foobar', 'error message is right');
    assert.ok(err.count === 2, 'error count is right');
    assert.ok(err.example === 'foobar', 'error example is right');
    assert.ok(err.errors[0] === err1, 'errors[0] is err1');
    assert.ok(err.errors[1] === err2, 'errors[1] is err2');

    assert.end();
});

test('resultArrayToError with all errors', function t4(assert) {
    var err1 = new Error('foobar');
    var err2 = new Error('timeout');
    var err3 = new Error('didnt work');

    var array = [
        new Result(err1),
        new Result(err2),
        new Result(err3)
    ];

    var err = Errors.resultArrayToError(array, 'thing.error');

    assert.ok(err.type === 'thing.error', 'error type is right');
    assert.ok(err.message === '3 errors. Example: foobar', 'error message is right');
    assert.ok(err.count === 3, 'error count is right');
    assert.ok(err.example === 'foobar', 'error example is right');
    assert.ok(err.errors[0] === err1, 'errors[0] is err1');
    assert.ok(err.errors[1] === err2, 'errors[1] is err2');
    assert.ok(err.errors[2] === err3, 'errors[1] is err2');

    assert.end();
});
