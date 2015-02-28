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

/*
 * Provides an async "barrier" for use in tests.
 *
 * A barrier is a function that expects to be called N-times.  Calling it more
 * than N times is an error.
 *
 * Once called N times, it executes a check function.
 *
 * The check function gets an array of the calling arguments in temporal order.
 *
 * To help with reconciling arbitrarily ordered events, a keyed convenience
 * layer is defined.
 */

module.exports = barrier;
module.exports.keyed = keyedBarrier;

function barrier(expected, check, callback) {
    var got = 0;
    var buffer = new Array(expected);
    return function() {
        if (got >= expected) return callback(new Error('barrier called two many times'));
        buffer[got] = Array.prototype.slice.call(arguments);
        if (++got < expected) return;
        check(buffer, callback);
    };
}

function keyedBarrier(expected, check, callback) {
    var bar = barrier(expected, function(results, done) {
        var idents = {};
        results.forEach(function(result) {
            idents[result[0]] = result[1];
        });
        check(idents, done);
    }, callback);
    return function(name) {
        return bar.bind(null, name);
    };
}
