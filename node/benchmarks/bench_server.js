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
var NullStatsd = require('uber-statsd-client/null');

var argv = parseArgs(process.argv.slice(2), {
    boolean: ['trace']
});

assert('trace' in argv, 'trace option needed');
assert(argv.traceRelayHostPort, 'traceRelayHostPort needed');

var Reporter = require('../tcollector/reporter.js');
var TChannel = require('../channel');
var server = TChannel({
    statTags: {
        app: 'my-server'
    },
    trace: true,
    statsd: NullStatsd()
});

var reporter = Reporter({
    channel: server.makeSubChannel({
        serviceName: 'tcollector',
        peers: [argv.traceRelayHostPort]
    }),
    logger: server.logger,
    callerName: 'my-server'
});
if (argv.trace) {
    server.tracer.reporter = function report(span) {
        reporter.report(span, {
            timeout: 10 * 1000
        });
    };
}

var serverChan = server.makeSubChannel({
    serviceName: 'benchmark'
});

server.listen(4040, '127.0.0.1');

var keys = {};

serverChan.register('ping', function onPing(req, res) {
    res.headers.as = 'raw';
    res.sendOk('pong', null);
});

serverChan.register('set', function onSet(req, res, arg2, arg3) {
    var key = arg2.toString('utf8');
    var val = arg3.toString('utf8');
    keys[key] = val;
    res.headers.as = 'raw';
    res.sendOk('ok', 'really ok');
});

serverChan.register('get', function onGet(req, res, arg2, arg3) {
    var key = arg2.toString('utf8');
    res.headers.as = 'raw';
    if (keys[key] !== undefined) {
        var val = keys[key];
        res.sendOk(val.length.toString(10), val);
    } else {
        res.sendNotOk('key not found', key);
    }
});

// setInterval(function () {
//  Object.keys(keys).forEach(function (key) {
//      console.log(key + '=' + keys[key].length + ' bytes');
//  });
// }, 1000);
