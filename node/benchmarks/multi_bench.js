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
/* eslint no-console:0 no-process-exit:0 */

var Statsd = require('uber-statsd-client');
var metrics = require('metrics');
var parseArgs = require('minimist');
var process = require('process');
var setTimeout = require('timers').setTimeout;
var Buffer = require('buffer').Buffer;
var console = require('console');

process.title = 'nodejs-benchmarks-multi_bench';

var TChannel = require('../channel');
var Reporter = require('../tcollector/reporter.js');
var base2 = require('../test/lib/base2');
var LCGStream = require('../test/lib/rng_stream');
var errors = require('../errors.js');

// TODO: disentangle the global closure of numClients and numRequestss and move
// these after the harness class declaration
var argv = parseArgs(process.argv.slice(2), {
    alias: {
        m: 'multiplicity',
        c: 'numClients',
        r: 'numRequests',
        p: 'pipeline',
        s: 'sizes'
    },
    default: {
        multiplicity: 1,
        numClients: 5,
        numRequests: 20000,
        pipeline: '10,100,1000,20000',
        sizes: '4,4096'
    },
    boolean: ['relay', 'trace', 'bad']
});
var multiplicity = parseInt(argv.multiplicity, 10);
var numClients = parseInt(argv.numClients, 10);
var numRequests = parseInt(argv.numRequests, 10);
argv.pipeline = parseIntList(argv.pipeline);
argv.sizes = parseIntList(argv.sizes);

var DESTINATION_SERVER;
var TRACE_SERVER;
var CLIENT_PORT = argv.clientPort;

if (argv.relay) {
    DESTINATION_SERVER = '127.0.0.1:7038';
} else {
    DESTINATION_SERVER = '127.0.0.1:' + argv.benchPort;
}

if (argv.trace) {
    TRACE_SERVER = '127.0.0.1:7037';
}

// -- test harness

function Test(args) {
    this.args = args;

    this.arg1 = new Buffer(args.command);
    this.arg2 = args.arg2 || null;
    this.arg3 = args.arg3 || null;

    this.callback = null;
    this.clients = [];
    this.clientsReady = 0;
    this.commandsSent = 0;
    this.commandsCompleted = 0;
    this.maxPipeline = this.args.pipeline || numRequests;
    this.clientOptions = args.clientOptions || {
        returnBuffers: false
    };

    this.connectLatency = new metrics.Histogram();
    this.readyLatency = new metrics.Histogram();
    this.commandLatency = new metrics.Histogram();

    this.expectedError = args.expectedError;
}

Test.prototype.copy = function copy() {
    return new Test(this.args);
};

Test.prototype.run = function run(callback) {
    var self = this;
    var i;

    this.callback = callback;

    var counter = numClients;
    for (i = 0; i < numClients; i++) {
        self.newClient(i, onReady);
    }

    function onReady(err) {
        if (err) {
            console.error('failed to setup clients', err);
        } else {
            counter--;
            if (counter === 0) {
                self.start();
            }
        }
    }
};

Test.prototype.newClient = function newClient(id, callback) {
    var self = this;
    var port = CLIENT_PORT + id;
    var clientChan = TChannel({
        statTags: {
            app: 'my-client'
        },
        emitConnectionMetrics: false,
        trace: true,
        statsd: new Statsd({
            host: '127.0.0.1',
            port: 7036
        })
    });

    // // useful for demonstrating (lack of) tombstone leak
    // var OpKindMonitor = require('../monitor').OpKindMonitor;
    // (new OpKindMonitor(clientChan, {
    //     log: console.error,
    //     desc: 'client:' + id,
    //     interval: 5000,
    // })).run();

    if (argv.trace) {
        var reporter = Reporter({
            channel: clientChan.makeSubChannel({
                serviceName: 'tcollector',
                peers: [TRACE_SERVER]
            }),
            logger: clientChan.logger,
            callerName: 'my-client'
        });

        clientChan.tracer.reporter = function report(span) {
            reporter.report(span, {
                timeout: 10 * 1000
            });
        };
    }

    var client = clientChan.makeSubChannel({
        serviceName: 'benchmark',
        peers: [DESTINATION_SERVER]
    });
    client.createTime = Date.now();
    client.listen(port, '127.0.0.1', function listened(err) {
        if (err) {
            return callback(err);
        }
        self.clients[id] = client;
        // sending a ping to pre-connect the socket
        client
            .request({
                serviceName: 'benchmark',
                hasNoParent: true,
                timeout: 30 * 1000,
                headers: {
                    as: 'raw',
                    cn: 'multi_bench'
                }
            })
            .send('ping', null, null, function pinged(err2) {
                if (err2) {
                    return callback(err2);
                }
                self.connectLatency.update(Date.now() - client.createTime);
                self.readyLatency.update(Date.now() - client.createTime);
                callback();
            });
    });
};

Test.prototype.start = function start() {
    this.testStart = Date.now();
    this.fillPipeline();
};

Test.prototype.fillPipeline = function fillPipeline() {
    var pipeline = this.commandsSent - this.commandsCompleted;

    while (this.commandsSent < numRequests && pipeline < this.maxPipeline) {
        this.commandsSent++;
        pipeline++;
        this.sendNext();
    }

    if (this.commandsCompleted === numRequests) {
        this.printStats();
        this.stopClients();
    }
};

Test.prototype.stopClients = function stopClients() {
    var self = this;

    this.clients.forEach(function each(client, pos) {
        if (pos === self.clients.length - 1) {
            client.quit(function done() {
                self.callback();
            });
        } else {
            client.quit();
        }
    });
};

Test.prototype.sendNext = function sendNext() {
    var self = this;
    var curClient = this.commandsSent % this.clients.length;
    var start = Date.now();

    var req = this.clients[curClient].request({
        serviceName: 'benchmark',
        hasNoParent: true,
        timeout: 30000,
        headers: {
            as: 'raw',
            cn: 'multi_bench',
            benchHeader1: 'bench value one',
            benchHeader2: 'bench value two',
            benchHeader3: 'bench value three'
        }
    });
    req.send(this.arg1, this.arg2, this.arg3, done);

    function done(err, res) {
        if (err) {
            if (!self.expectedError ||
                !self.expectedError(err, req, res)) {
                throw err;
            }
        }
        self.commandsCompleted++;
        self.commandLatency.update(Date.now() - start);
        self.fillPipeline();
    }
};

Test.prototype.getStats = function getStats() {
    var obj = this.commandLatency.printObj();
    obj.descr = this.args.descr;
    obj.instanceNumber = argv.instanceNumber;
    obj.pipeline = this.args.pipeline;
    obj.numClients = this.clientsReady;
    obj.elapsed = Date.now() - this.testStart;
    obj.numRequests = numRequests;
    obj.rate = numRequests / (obj.elapsed / 1000);
    return obj;
};

Test.prototype.printStats = function printStats() {
    var obj = this.getStats();
    process.stdout.write(JSON.stringify(obj) + '\n');
};

// -- define tests

var tests = [];

if (!argv.skipPing) {
    argv.pipeline.forEach(function each(pipeline) {
        tests.push(new Test({
            descr: 'PING',
            command: 'ping',
            args: null,
            pipeline: pipeline
        }));
    });
}

var randBytes = new LCGStream({
    seed: 1234,
    limit: Infinity
});

argv.sizes.forEach(function each(size) {
    var sizeDesc = base2.pretty(size, 'B');
    var key = 'foo_rand000000000000';

    // 4 base64 encoded bytes per 3 raw bytes
    var buf = randBytes.read(Math.ceil(size / 4 * 3));
    if (!buf) {
        throw new Error('can\'t have size ' + sizeDesc);
    }

    // chop off any "==" trailer
    var str = buf.toString('base64').slice(0, size);

    var expectedErrorTypes = {};
    if (argv.bad) {
        expectedErrorTypes.BadRequest = true;
    }

    argv.pipeline.forEach(function each(pipeline) {
        tests.push(new Test({
            descr: 'SET ' + sizeDesc,
            command: 'set' + (argv.bad ? '_bad' : ''),
            arg2: key,
            arg3: str,
            pipeline: pipeline,
            expectedError: expectedError
        }));
        tests.push(new Test({
            descr: 'GET ' + sizeDesc,
            command: 'get' + (argv.bad ? '_bad' : ''),
            arg2: key,
            pipeline: pipeline,
            expectedError: expectedError
        }));
    });

    function expectedError(err) {
        var type = errors.classify(err) || err.type;
        return expectedErrorTypes[type] || false;
    }
});

function next(i, j, done) {
    if (i >= tests.length) {
        return done();
    }
    if (j >= multiplicity) {
        return next(i + 1, 0, done);
    }

    var test = tests[i].copy();
    test.run(function runit() {
        setTimeout(function delayNext() {
            next(i, j + 1, done);
        }, 1000);
    });
}

next(0, 0, function finish() {
    process.exit(0);
});

function parseIntList(str) {
    if (typeof str === 'number') {
        return [str];
    }
    return str
        .split(/\s*,\s*/)
        .map(function each(part) {
            return parseInt(part, 10);
        });
}
