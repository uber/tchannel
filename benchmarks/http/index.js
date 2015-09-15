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

/* eslint no-console: 0 */
var parseArgs = require('minimist');
var process = require('process');
var path = require('path');
var util = require('util');
var loadtest = require('loadtest');

var BenchmarkRunner = require('../index.js');

var ingressServer = path.join(__dirname, '..', '..', 'examples', 'http_ingress.js');
var egressServer = path.join(__dirname, '..', '..', 'examples', 'http_egress.js');

var HTTP_SERVER_PORT = 8000;
var INGRESS_SERVER_PORT = 4040;
var EGRESS_SERVER_PORT = 8080;

module.exports = BenchmarkRunner;

function HTTPBenchmarkRunner(opts) {
    if (!(this instanceof HTTPBenchmarkRunner)) {
        return new HTTPBenchmarkRunner(opts);
    }
    var self = this;
    BenchmarkRunner.call(self, opts);
    self.ports = {
        httpPort: HTTP_SERVER_PORT,
        ingressPort: INGRESS_SERVER_PORT,
        egressPort: EGRESS_SERVER_PORT
    };
}
util.inherits(HTTPBenchmarkRunner, BenchmarkRunner);

HTTPBenchmarkRunner.prototype.spawnRelayServer =
function spawRelayServer() {
    var self = this;
    var ingressArgs = [
        '--tchannel-port', self.ports.ingressPort,
        self.serviceName,
        '127.0.0.1:' + self.ports.httpPort
    ];
    if (self.opts.ingressStreamed) {
        ingressArgs.push('--streamed');
    }
    var ingressProc = self.run(ingressServer, ingressArgs);
    self.relayProcs.push(ingressProc);
    ingressProc.stdout.pipe(process.stderr);
    ingressProc.stderr.pipe(process.stderr);
    var egressArgs = [
        '--http-port', self.ports.egressPort,
        '--peers', '127.0.0.1:' + self.ports.ingressPort,
        self.serviceName
    ];
    if (self.opts.egressStreamed) {
        egressArgs.push('--streamed');
    }
    var egressProc = self.run(egressServer, egressArgs);
    self.relayProcs.push(egressProc);
    egressProc.stdout.pipe(process.stderr);
    egressProc.stderr.pipe(process.stderr);
};

HTTPBenchmarkRunner.prototype.spawnTargetServer =
    function spawnTargetServer() {
    var self = this;
    var serverProc = self.runExternal('../../node_modules/loadtest/bin/testserver.js', [
        self.ports.httpPort
    ]);
    self.serverProcs.push(serverProc);
    serverProc.stdout.pipe(process.stderr);
    serverProc.stderr.pipe(process.stderr);
};

HTTPBenchmarkRunner.prototype.spawnBenchmarkClient =
    function spawnBenchmarkClient() {
    var self = this;
    var targetPort = self.ports.httpPort;
    if (self.opts.relay) {
        targetPort = self.ports.egressPort;
    }
    var options = {
        url: 'http://127.0.0.1:' + targetPort,
        concurrency: self.opts.numClients,
        maxRequests: self.opts.numRequests,
        agentKeepAlive: self.opts.keepAlive
    };
    loadtest.loadTest(options, function(error, result) {
        if (error) {
            console.error('benchmark failed with', error);
        } else {
            console.log('benchmark result', result);
        }
        self.close();
    });
};

if (require.main === module) {
    var argv = parseArgs(process.argv.slice(2), {
        '--': true,
        alias: {
            o: 'output',
            c: 'numClients',
            r: 'numRequests'
        },
        default: {
            numClients: 5,
            numRequests: 5000
        },
        boolean: ['relay', 'ingressStreamed', 'egressStreamed', 'keepAlive']
    });
    var runner = HTTPBenchmarkRunner(argv);
    runner.start();
}
