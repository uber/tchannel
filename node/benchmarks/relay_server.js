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

var NullStatsd = require('uber-statsd-client/null');
var parseArgs = require('minimist');
var process = require('process');
var assert = require('assert');

var TChannel = require('../channel.js');
var Reporter = require('../tcollector/reporter.js');
var ServiceProxy = require('../hyperbahn/service_proxy.js');
var FakeEgressNodes = require('../test/lib/fake-egress-nodes.js');

var argv = parseArgs(process.argv.slice(2), {
    boolean: ['trace']
});

if (argv.type === 'bench-relay') {
    process.title = 'nodejs-benchmarks-relay_bench_server';
} else if (argv.type === 'trace-relay') {
    process.title = 'nodejs-benchmarks-relay_trace_server';
}

RelayServer(argv);

function RelayServer(opts) {
    /*eslint max-statements: [2, 25]*/
    if (!(this instanceof RelayServer)) {
        return new RelayServer(opts);
    }

    var self = this;

    assert(opts.benchPort, 'benchPort required');
    assert(opts.benchRelayPort, 'benchRelayPort required');
    assert(opts.tracePort, 'tracePort required');
    assert(opts.traceRelayPort, 'traceRelayPort required');
    assert(
        opts.type === 'bench-relay' || opts.type === 'trace-relay',
        'a valid type required'
    );
    assert('trace' in opts, 'trace is a required options');
    assert('debug' in opts, 'debug is a required options');

    var benchHostPort = '127.0.0.1:' + opts.benchPort;
    var benchRelayHostPort = '127.0.0.1:' + opts.benchRelayPort;
    var traceHostPort = '127.0.0.1:' + opts.tracePort;
    var traceRelayHostPort = '127.0.0.1:' + opts.traceRelayPort;

    self.relay = TChannel({
        statTags: {
            app: 'relay-server'
        },
        logger: opts.debug ? require('debug-logtron')('relay') : null,
        trace: true,
        statsd: NullStatsd()
    });
    self.relay.handler = ServiceProxy({
        channel: self.relay,
        egressNodes: FakeEgressNodes({
            hostPort: opts.type === 'bench-relay' ?
                benchRelayHostPort : opts.type === 'trace-relay' ?
                traceRelayHostPort : null,
            topology: {
                'benchmark': [benchRelayHostPort],
                'tcollector': [traceRelayHostPort]
            }
        })
    });

    self.tcollectorChannel = TChannel({
        trace: false,
        statsd: NullStatsd(),
        logger: self.relay.logger,
        statTags: {
            app: 'relay-server'
        }
    });
    self.reporter = Reporter({
        channel: self.tcollectorChannel.makeSubChannel({
            serviceName: 'tcollector',
            peers: [traceRelayHostPort]
        }),
        logger: self.relay.logger,
        callerName: opts.type
    });

    if (opts.trace) {
        self.relay.tracer.reporter = function report(span) {
            self.reporter.report(span, {
                timeout: 10 * 1000
            });
        };
    }

    if (opts.type === 'bench-relay') {
        self.relay.handler.createServiceChannel('benchmark');
        self.relay.listen(opts.benchRelayPort, '127.0.0.1', onListen);
    } else if (opts.type === 'trace-relay') {
        self.relay.handler.createServiceChannel('tcollector');
        self.relay.listen(opts.traceRelayPort, '127.0.0.1', onListen);
    }

    function onListen() {
        var peer;

        if (opts.type === 'bench-relay') {
            peer = self.relay.handler.getServicePeer(
                'benchmark', benchHostPort
            );
            peer.connect();
        } else if (opts.type === 'trace-relay') {
            peer = self.relay.handler.getServicePeer(
                'tcollector', traceHostPort
            );
            peer.connect();
        }
    }
}
