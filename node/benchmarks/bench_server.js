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

var process = require('process');
process.title = 'nodejs-benchmarks-bench_server';

var parseArgs = require('minimist');
var assert = require('assert');
var Statsd = require('uber-statsd-client');

var Reporter = require('../tcollector/reporter.js');
var TChannel = require('../channel');

var argv = parseArgs(process.argv.slice(2), {
    boolean: ['trace']
});

assert('trace' in argv, 'trace option needed');
assert(argv.traceRelayHostPort, 'traceRelayHostPort needed');
assert(argv.port, 'port needed');
assert(argv.instances, 'instances needed');

function BenchServer(port) {
    if (!(this instanceof BenchServer)) {
        return new BenchServer(port);
    }

    var self = this;

    self.port = port;
    self.server = TChannel({
        statTags: {
            app: 'my-server'
        },
        trace: true,
        statsd: new Statsd({
            host: '127.0.0.1',
            port: 7036
        })
    });

    if (argv.trace) {
        self.setupReporter();
    }

    self.serverChan = self.server.makeSubChannel({
        serviceName: 'benchmark'
    });

    self.keys = {};

    self.registerEndpoints();
}

BenchServer.prototype.setupReporter = function setupReporter() {
    var self = this;

    var reporter = Reporter({
        channel: self.server.makeSubChannel({
            serviceName: 'tcollector',
            peers: [argv.traceRelayHostPort]
        }),
        logger: self.server.logger,
        callerName: 'my-server'
    });

    self.server.tracer.reporter = function report(span) {
        reporter.report(span, {
            timeout: 10 * 1000
        });
    };
};

BenchServer.prototype.registerEndpoints = function registerEndpoints() {
    var self = this;

    self.serverChan.register('ping', function onPing(req, res) {
        res.headers.as = 'raw';
        res.sendOk('pong', null);
    });

    self.serverChan.register('set', function onSet(req, res, arg2, arg3) {
        var key = arg2.toString('utf8');
        var val = arg3.toString('utf8');
        self.keys[key] = val;
        res.headers.as = 'raw';
        res.sendOk('ok', 'really ok');
    });

    self.serverChan.register('get', function onGet(req, res, arg2, arg3) {
        var key = arg2.toString('utf8');
        res.headers.as = 'raw';
        if (self.keys[key] !== undefined) {
            var val = self.keys[key];
            res.sendOk(val.length.toString(10), val);
        } else {
            res.sendNotOk('key not found', key);
        }
    });
};

BenchServer.prototype.listen = function listen() {
    var self = this;

    self.server.listen(self.port, '127.0.0.1');
};

var benchServer = BenchServer(argv.port);
benchServer.listen();

// setInterval(function () {
//  Object.keys(keys).forEach(function (key) {
//      console.log(key + '=' + keys[key].length + ' bytes');
//  });
// }, 1000);
