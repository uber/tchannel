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

var Result = require('bufrw/result');

module.exports = collectParallel;

function collectParallel(tasks, iteratee, callback) {
    var keys = Object.keys(tasks);
    var results = Array.isArray(tasks) ? [] : {};
    var context = new ParallelContext(
        results, keys.length, callback
    );

    if (context.counter === 0) {
        callback(null, context.results);
        return;
    }

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = tasks[key];

        iteratee(value, key, insertResult(context, key));
    }
}

function insertResult(context, resultKey) {
    return callback;

    function callback(err, result) {
        context.results[resultKey] = new Result(err, result);

        if (--context.counter === 0) {
            return context.callback(null, context.results);
        }
    }
}

function ParallelContext(results, counter, callback) {
    this.results = results;
    this.counter = counter;
    this.callback = callback;
}
