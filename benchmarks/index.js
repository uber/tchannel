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

var childProcess = require('child_process');
var path = require('path');

var server = path.join(__dirname, 'bench_server.js');
var bench = path.join(__dirname, 'multi_bench.js');

var serverProc = childProcess.spawn('node', [server]);

serverProc.stdout.pipe(process.stderr);
serverProc.stderr.pipe(process.stderr);

setTimeout(function nextProc() {
    var benchProc = childProcess.spawn('node', [bench]);

    benchProc.stdout.pipe(process.stdout);
    benchProc.stderr.pipe(process.stderr);

    benchProc.once('close', function onClose() {
        serverProc.kill();
    });
}, 500);
