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
var util = require('util');

module.exports = parserTest;

function parserTest(desc, parser, chunks, expected) {
    test(desc, function t(assert) {
        var expectedI = 0;
        var done = false;

        if (typeof parser === 'function') parser = parser();

        parser.on('frame', function onFrame(frame) {
            expect('frame', frame);
        });
        parser.on('error', function onError(error) {
            expect('error', error);
        });

        chunks.forEach(function eachPart(chunk) {
            parser.execute(chunk);
        });

        function expect(kind, result) {
            if (expectedI >= expected.length) {
                finish(new Error(util.format(
                    'got more than the expected %s results',
                    expected.length)));
                return;
            }

            var e = expected[expectedI++];
            if (e[kind] === undefined) {
                var eKind = Object.keys(e)[0];
                if (kind === 'error') {
                    assert.error(result);
                } else {
                    assert.fail(util.format(
                        'expected a %s, got a %s instead',
                        eKind, kind));
                }
            } else if (typeof e[kind] === 'function') {
                e[kind](result, assert);
            } else {
                assert.deepEqual(result, e[kind],
                    util.format('got expected[%s] %s', expectedI, kind));
            }

            if (expectedI === expected.length) finish(null);
        }

        function finish(err) {
            if (done) {
                if (err) throw err;
                return;
            }
            done = true;
            console.log('fin');

            if (err) {
                assert.end(err);
                return;
            }

            parser.flush();
            process.nextTick(function testDone() {
                if (expectedI < expected.length) {
                    assert.fail(util.format(
                        'got less than the expected %s results',
                        expected.length));
                }
                assert.end();
            });
        }
    });
}
