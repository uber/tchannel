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

// do something like:
// $ git show REF1:lib/write.js > lib/write_a.js
// $ git show REF2:lib/write.js > lib/write_b.js

var a = require('../lib/write_a.js');
var b = require('../lib/write_b.js');

var split2 = require('split2');

// run rep rounds n sampled items
var rep = 100;
var n = 100000;

function sample(k, stream, callback) {
    var n = 0;
    var S = new Array(k);
    stream
        .on('data', function onItem(item) {
            if (++n <= k) {
                S[n-1] = item;
            } else {
                var i = Math.floor(Math.random() * n);
                if (i < k) {
                    S[i] = item;
                }
            }
        });
    stream.on('end', function onEnd() {
        callback(null, S);
    });
}

sample(n, process.stdin.pipe(split2()), function run(err, S) {
    for (var i = 0; i < rep; ++i) {
        var aStats = round(expA, S);
        var bStats = round(expB, S);
        console.log(
            aStats.result, aStats.elapsed,
            bStats.result, bStats.elapsed,
            1 - bStats.elapsed / aStats.elapsed);
    }
});

function expA(S) {
    var ws = new Array(S.length);
    for (var i = 0; i < S.length; ++i) {
        ws[i] = a.buf1(S[i]);
    }
    var buf = a.series(ws).create();
    return buf.length;
}

function expB(S) {
    var ws = new Array(S.length);
    for (var i = 0; i < S.length; ++i) {
        ws[i] = b.buf1(S[i]);
    }
    var buf = b.series(ws).create();
    return buf.length;
}

function round(e, S) {
    var start = Date.now();
    var result = e(S);
    var end = Date.now();
    return {
        size: S.length,
        result: result,
        elapsed: end - start
    };
}
