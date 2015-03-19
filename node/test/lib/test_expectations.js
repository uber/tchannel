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

// ---

module.exports = testExpectations;

var test = require('tape');
var once = require('once');
var TypedError = require('error/typed');

var TooManyResults = TypedError({
    type: 'test-expectations.too-many-results',
    message: 'got more results than expected; got: {got} expected {expected}',
    got: null,
    expected: null
});

var TooFewResults = TypedError({
    type: 'test-expectations.too-few-results',
    message: 'got less results than expected; got: {got} expected {expected}',
    got: null,
    expected: null
});

var MismatchedExpectationKind = TypedError({
    type: 'test-expectations.mismatched-kind',
    message: 'expectad a {expected} got a {got} instead',
    got: null,
    expected: null
});

function testExpectations(desc, expected, func) {
    test(desc, function t(assert) {
        var expectedI = 0;
        var finish = once(done);

        func(expect, finish);

        function expect(kind, result) {
            if (finish.called) {
                return;
            }

            if (expectedI >= expected.length) {
                finish(TooManyResults({
                    got: expectedI+1,
                    expected: expected.length
                }));
                return;
            }
            var e = expected[expectedI++];
            if (e[kind] === undefined) {
                var eKind = Object.keys(e)[0];
                if (kind === 'error') {
                    finish(result);
                } else {
                    finish(MismatchedExpectationKind({
                        got: null,
                        expected: eKind
                    }));
                }
            } else {
                e[kind](result, assert);
            }
        }

        function done(err) {
            if (!err && expectedI < expected.length) {
                err = TooFewResults({
                    got: expectedI+1,
                    expected: expected.length
                });
            }
            if (err) {
                assert.end(err);
            } else {
                assert.end();
            }
        }
    });
}
