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
var dgram = require('dgram');

var server = path.join(__dirname, 'bench_server.js');
var relay = path.join(__dirname, 'relay_server.js');
var trace = path.join(__dirname, 'trace_server.js');
var bench = path.join(__dirname, 'multi_bench.js');

process.stderr.setMaxListeners(Infinity);

var SERVER_PORT = 7100;
var TRACE_SERVER_PORT = 7039;
var RELAY_SERVER_PORT = 7038;
var RELAY_TRACE_PORT = 7037;
var STATSD_PORT = 7036;
var INSTANCE_COUNT = 72;
var CLIENT_PORT = 7041;

function BenchmarkRunner(opts) {
    if (!(this instanceof BenchmarkRunner)) {
        return new BenchmarkRunner(opts);
    }

    var self = this;

    self.opts = opts;

    self.relayProcs = [];
    self.statsdServer = null;
    self.serverProcs = [];
    self.traceProc = null;
    self.benchProcs = [];
    self.benchCounter = 0;
    self.fileStream = null;
}

BenchmarkRunner.prototype.start = function start() {
    var self = this;

    self.startStatsd();

    if (self.opts.multiProc) {
        self.startServer(SERVER_PORT, 24);
        self.startServer(SERVER_PORT + 24, 24);
        self.startServer(SERVER_PORT + 48, 24);
    } else {
        self.startServer(SERVER_PORT, INSTANCE_COUNT);
    }

    if (self.opts.trace) {
        self.startTraceServer();
    }

    if (self.opts.relay || self.opts.trace) {
        setTimeout(startRelayServers, 500);
    } else {
        setTimeout(startClient, 500);
    }

    function startRelayServers() {
        self.startRelay('bench-relay');
        if (self.opts.trace) {
            self.startRelay('trace-relay');
        }

        setTimeout(startClient, 500);
    }

    function startClient() {
        self.openFileStream();

        if (self.opts.multiProc) {
            self.startClient(CLIENT_PORT);
            self.startClient(CLIENT_PORT + 200);
            self.startClient(CLIENT_PORT + 300);
        } else {
            self.startClient(CLIENT_PORT);
        }

        if (self.opts.torch) {
            self.startTorch();
        }
    }
};

BenchmarkRunner.prototype.startStatsd = function startStatsd() {
    var self = this;

    self.statsdServer = dgram.createSocket('udp4');
    self.statsdServer.bind(STATSD_PORT);
};

BenchmarkRunner.prototype.startServer =
function startServer(serverPort, instances) {
    var self = this;

    if (self.opts.goServer) {
      return self.startGoServer(serverPort, instances);
    }

    var noOverhead = self.opts.noEndpointOverhead;

    var serverProc = run(server, [
        self.opts.trace ? '--trace' : '--no-trace',
        '--traceRelayHostPort', '127.0.0.1:' + RELAY_TRACE_PORT,
        '--port', String(serverPort),
        '--instances', String(instances),
        '--pingOverhead', noOverhead ? 'none' : 'norm:10,5',
        '--setOverhead', noOverhead ? 'none' : 'norm:200,20',
        '--getOverhead', noOverhead ? 'none' : 'norm:100,10'
    ]);
    self.serverProcs.push(serverProc);
    serverProc.stdout.pipe(process.stderr);
    serverProc.stderr.pipe(process.stderr);
};

BenchmarkRunner.prototype.startGoServer =
function startGoServer(serverPort, instances) {
    var self = this;

    var serverProc = runExternal("../../golang/build/examples/bench/server", [
      "--host", "localhost",
      "--port", String(serverPort),
      "--instances", String(instances),
    ]);
    self.serverProcs.push(serverProc);
    serverProc.stdout.pipe(process.stderr);
    serverProc.stderr.pipe(process.stderr);
};

BenchmarkRunner.prototype.startTraceServer =
function startTraceServer() {
    var self = this;

    self.traceProc = run(trace);
    self.traceProc.stdout.pipe(process.stderr);
    self.traceProc.stderr.pipe(process.stdout);
};

BenchmarkRunner.prototype.startRelay =
function startRelay(type) {
    var self = this;

    // type = 'bench-relay'
    var relayProc = run(relay, [
        '--benchPort', String(SERVER_PORT),
        '--tracePort', String(TRACE_SERVER_PORT),
        '--benchRelayPort', String(RELAY_SERVER_PORT),
        '--traceRelayPort', String(RELAY_TRACE_PORT),
        '--type', type,
        '--instances', String(INSTANCE_COUNT),
        self.opts.trace ? '--trace' : '--no-trace',
        self.opts.debug ? '--debug' : '--no-debug'
    ]);
    self.relayProcs.push(relayProc);
    relayProc.stdout.pipe(process.stderr);
    relayProc.stderr.pipe(process.stderr);
};

BenchmarkRunner.prototype.openFileStream =
function openFileStream() {
    var self = this;

    if (self.opts.output) {
        self.fileStream = fs.createWriteStream(self.opts.output, {
            encoding: 'utf8'
        });
    }
};

BenchmarkRunner.prototype.startClient =
function startClient(clientPort) {
    var self = this;

    self.benchCounter++;

    var args = self.opts['--'];
    args = args.concat([
        '--benchPort', String(SERVER_PORT),
        '--clientPort', String(clientPort),
        '--instanceNumber', String(self.benchCounter)
    ]);
    var benchProc = run(bench, args);
    self.benchProcs.push(benchProc);

    benchProc.stderr.pipe(process.stderr);

    benchProc.stdout
        .pipe(ldj.parse())
        .on('data', function onChunk(result) {
            console.log(util.format(
                '%s: %s, %s/%s min/max/avg/p95: %s/%s/%s/%s %sms total, %s ops/sec',
                String(result.instanceNumber),
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

            if (self.fileStream) {
                self.fileStream.write(JSON.stringify(result) + '\n');
            }
        });

    benchProc.once('close', function onClose() {
        if (--self.benchCounter === 0) {
            self.close();
        }
    });
};

BenchmarkRunner.prototype.close = function close() {
    var self = this;

    console.error('benchmark finished');
    for (var i = 0; i < self.serverProcs.length; i++) {
        self.serverProcs[i].kill();
    }
    if (self.traceProc) {
        self.traceProc.kill();
    }

    if (self.fileStream) {
        self.fileStream.end();
    }

    for (i = 0; i < self.relayProcs.length; i++) {
        self.relayProcs[i].kill();
    }

    self.statsdServer.close();
};

BenchmarkRunner.prototype.startTorch = function startTorch() {
    var self = this;

    assert(self.opts.torch === 'client' ||
           self.opts.torch === 'relay' ||
           self.opts.torch === 'server',
           'Torch flag must be client or relay'
    );
    assert(self.opts.torchFile, 'torchFile needed');

    var torchPid;
    var torchFile = self.opts.torchFile;
    var torchTime = self.opts.torchTime || '30';
    var torchDelay = self.opts.torchDelay || 10 * 1000;
    var torchType = self.opts.torchType || 'raw';

    if (self.opts.torch === 'relay') {
        torchPid = self.relayProcs[0].pid;
    } else if (self.opts.torch === 'client') {
        torchPid = self.benchProcs[0].pid;
    } else if (self.opts.torch === 'server') {
        torchPid = self.serverProcs[0].pid;
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
};

if (require.main === module) {
    var argv = parseArgs(process.argv.slice(2), {
        '--': true,
        alias: {
            o: 'output'
        },
        boolean: ['relay', 'trace', 'debug', 'noEndpointOverhead']
    });
    var runner = BenchmarkRunner(argv);
    runner.start();
}

function lpad(input, len, chr) {
    var str = input.toString();
    chr = chr || ' ';

    while (str.length < len) {
        str = chr + str;
    }
    return str;
}

function runExternal(runner, args) {
  var child = childProcess.spawn(runner, args);
  console.error('running', runner, child.pid);
  return child;
}

function run(script, args) {
    var name = script.replace(/\.js$/, '');
    args = args ? args.slice(0) : [];
    args.unshift(script);
    var child = childProcess.spawn(process.execPath, args);
    console.error('running', name, child.pid);
    return child;
}
