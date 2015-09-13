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
var parseArgs = require('minimist');
var process = require('process');
var util = require('util');
var path = require('path');

var BenchmarkRunner = require('tchannel/benchmarks/');

var bahn = path.join(__dirname, 'hyperbahn-worker.js');
var naiveRelay = path.join(__dirname, 'naive-relay.js');

function HyperbahnBenchmarkRunner(opts) {
    if (!(this instanceof HyperbahnBenchmarkRunner)) {
        return new HyperbahnBenchmarkRunner(opts);
    }

    var self = this;
    BenchmarkRunner.call(self, opts);

    if (opts.useNaive) {
        self.spawnRelayServer = self.spawnNaiveRelayServer;
    }
}
util.inherits(HyperbahnBenchmarkRunner, BenchmarkRunner);

HyperbahnBenchmarkRunner.prototype.spawnNaiveRelayServer =
function spawnNaiveRelayServer() {
    var self = this;

    var naiveRelayProc = self.run(naiveRelay, [
        '--destination', String(self.ports.serverPort),
        '--instances', String(self.instanceCount),
        '--port', String(self.ports.relayServerPort)
    ]);
    self.relayProcs.push(naiveRelayProc);
    naiveRelayProc.stdout.pipe(process.stderr);
    naiveRelayProc.stderr.pipe(process.stderr);
};

HyperbahnBenchmarkRunner.prototype.spawnRelayServer =
function spawnRelayServer() {
    var self = this;

    var hyperbahnProc = self.run(bahn, [
        '--serverPort', String(self.ports.serverPort),
        '--serverServiceName', String(self.serviceName),
        '--instances', String(self.instanceCount),
        '--workerPort', String(self.ports.relayServerPort),
        '--statsdPort', String(self.ports.statsdPort)
    ]);
    self.relayProcs.push(hyperbahnProc);
    hyperbahnProc.stdout.pipe(process.stderr);
    hyperbahnProc.stderr.pipe(process.stderr);
};

if (require.main === module) {
    var argv = parseArgs(process.argv.slice(2), {
        '--': true,
        alias: {
            o: 'output'
        },
        boolean: ['relay', 'trace', 'debug', 'noEndpointOverhead']
    });
    var runner = HyperbahnBenchmarkRunner(argv);
    runner.start();
}
