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

/*eslint no-console: 0*/
var childProcess = require('child_process');
var parseArgs = require('minimist');
var path = require('path');
var ldj = require('ldjson-stream');
var fs = require('fs');
var util = require('util');
var process = require('process');
var console = require('console');
var setTimeout = require('timers').setTimeout;
var assert = require('assert');

var server = path.join(__dirname, 'bench_server.js');
var relay = path.join(__dirname, 'relay_server.js');
var trace = path.join(__dirname, 'trace_server.js');
var bench = path.join(__dirname, 'multi_bench.js');

var argv = parseArgs(process.argv.slice(2), {
    '--': true,
    alias: {
        o: 'output'
    },
    boolean: ['relay', 'trace', 'debug']
});

function run(script, args) {
    var name = script.replace(/\.js$/, '');
    args = args ? args.slice(0) : [];
    args.unshift(script);
    var child = childProcess.spawn(process.execPath, args);
    console.error('running', name, child.pid);
    return child;
}

var serverProc = run(server, [
    argv.trace ? '--trace' : '--no-trace',
    '--traceRelayHostPort', '127.0.0.1:7037'
]);
serverProc.stdout.pipe(process.stderr);
serverProc.stderr.pipe(process.stderr);

if (argv.trace) {
    var traceProc = run(trace);
    traceProc.stdout.pipe(process.stderr);
    traceProc.stderr.pipe(process.stdout);
}

var benchRelayProc;
var traceRelayProc;
var traceRelayClientProc;

if (argv.relay || argv.trace) {
    setTimeout(startRelayServers, 500);
} else {
    setTimeout(startBench, 500);
}

function startRelayServers() {
    benchRelayProc = run(relay, [
        '--benchPort', '7040',
        '--tracePort', '7039',
        '--benchRelayPort', '7038',
        '--traceRelayPort', '7037',
        '--traceRelayClientPort', '7036',
        '--type', 'bench-relay',
        argv.trace ? '--trace' : '--no-trace',
        argv.debug ? '--debug' : '--no-debug'
    ]);
    benchRelayProc.stdout.pipe(process.stderr);
    benchRelayProc.stderr.pipe(process.stderr);

    if (argv.trace) {
        traceRelayProc = run(relay, [
            '--benchPort', '7040',
            '--tracePort', '7039',
            '--benchRelayPort', '7038',
            '--traceRelayPort', '7037',
            '--traceRelayClientPort', '7036',
            '--type', 'trace-relay',
            argv.trace ? '--trace' : '--no-trace',
            argv.debug ? '--debug' : '--no-debug'
        ]);
        traceRelayProc.stdout.pipe(process.stderr);
        traceRelayProc.stderr.pipe(process.stderr);
    }

    if (argv.trace) {
        traceRelayClientProc = run(relay, [
            '--benchPort', '7040',
            '--tracePort', '7039',
            '--benchRelayPort', '7038',
            '--traceRelayPort', '7037',
            '--traceRelayClientPort', '7036',
            '--type', 'trace-relay-client',
            argv.trace ? '--trace' : '--no-trace',
            argv.debug ? '--debug' : '--no-debug'
        ]);
        traceRelayClientProc.stdout.pipe(process.stderr);
        traceRelayClientProc.stderr.pipe(process.stderr);
    }

    setTimeout(startBench, 500);
}

function startBench() {
    var benchProc = run(bench, argv['--']);
    process.stderr.setMaxListeners(100);
    benchProc.stderr.pipe(process.stderr);

    benchProc.stdout
        .pipe(ldj.parse())
        .on('data', function onChunk(result) {
            console.log(util.format(
                '%s, %s/%s min/max/avg/p95: %s/%s/%s/%s %sms total, %s ops/sec',
                lpad(result.descr, 13),
                lpad(result.pipeline, 5),
                result.numClients,
                lpad(result.min, 4),
                lpad(result.max, 4),
                lpad(result.mean.toFixed(2), 7),
                lpad(result.p95.toFixed(2), 7),
                lpad(result.elapsed, 6),
                lpad(typeof result.rate === 'number' ?
                    result.rate.toFixed(2) : 'NaN', 8
                )
            ));
        });

    if (argv.output) {
        benchProc.stdout
            .pipe(fs.createWriteStream(argv.output, {encoding: 'utf8'}));
    }

    if (argv.torch) {
        assert(argv.torch === 'client' ||
               argv.torch === 'relay' ||
               argv.torch === 'server',
               'Torch flag must be client or relay'
        );
        assert(argv.torchFile, 'torchFile needed');

        var torchPid;
        var torchFile = argv.torchFile;
        var torchTime = argv.torchTime || '30';
        var torchDelay = argv.torchDelay || 10 * 1000;
        var torchType = argv.torchType || 'raw';

        if (argv.torch === 'relay') {
            torchPid = benchRelayProc.pid;
        } else if (argv.torch === 'client') {
            torchPid = benchProc.pid;
        } else if (argv.torch === 'server') {
            torchPid = serverProc.pid;
        }

        setTimeout(function delayTorching() {
            var torchProc = childProcess.spawn('sudo', [
                'torch', torchPid, torchType, torchTime
            ]);
            torchProc.stdout.pipe(
                fs.createWriteStream(torchFile)
            );
            torchProc.stderr.pipe(process.stderr);
            console.error('starting flaming');

            torchProc.once('close', function onTorchClose() {
                console.error('finished flaming');
            });
        }, torchDelay);
    }

    benchProc.once('close', function onClose() {
        console.error('benchmark finished');
        serverProc.kill();
        if (traceProc) {
            traceProc.kill();
        }
        if (traceRelayProc) {
            traceRelayProc.kill();
        }
        if (benchRelayProc) {
            benchRelayProc.kill();
        }
        if (traceRelayClientProc) {
            traceRelayClientProc.kill();
        }
    });
}

function lpad(input, len, chr) {
    var str = input.toString();
    chr = chr || ' ';

    while (str.length < len) {
        str = chr + str;
    }
    return str;
}
