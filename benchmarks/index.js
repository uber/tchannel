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
var parseArgs = require('minimist');
var path = require('path');
var ldj = require('ldjson-stream');
var fs = require('fs');
var util = require('util');

var server = path.join(__dirname, 'bench_server.js');
var bench = path.join(__dirname, 'multi_bench.js');

var argv = parseArgs(process.argv.slice(2), {
    alias: {
        m: 'multiplicity',
        o: 'output'
    }
});
var multiplicity = parseInt(argv.multiplicity) || 2;

function run(script, args) {
    args = args ? args.slice(0) : [];
    args.unshift(script);
    var child = childProcess.spawn('node', args);
    return child;
}

var serverProc = run(server);
serverProc.stdout.pipe(process.stderr);
serverProc.stderr.pipe(process.stderr);

var benchProc = run(bench, ['--multiplicity', String(multiplicity)]);
benchProc.stderr.pipe(process.stderr);

benchProc.stdout
    .pipe(ldj.parse())
    .on('data', function(result) {
        console.log(util.format(
            "%s, %s/%s min/max/avg/p95: %s/%s/%s/%s %sms total, %s ops/sec",
            lpad(result.descr, 13),
            lpad(result.pipeline, 5),
            result.numClients,
            lpad(result.min, 4),
            lpad(result.max, 4),
            lpad(result.mean.toFixed(2), 7),
            lpad(result.p95.toFixed(2), 7),
            lpad(result.elapsed, 6),
            lpad(result.rate.toFixed(2), 8)
        ));
    });

if (argv.output) {
    benchProc.stdout
        .pipe(fs.createWriteStream(argv.output, {encoding: 'utf8'}));
}


benchProc.once('close', function onClose() {
    serverProc.kill();
});

function lpad(input, len, chr) {
    var str = input.toString();
    chr = chr || " ";

    while (str.length < len) {
        str = chr + str;
    }
    return str;
}
