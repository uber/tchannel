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

var Statsd = require('uber-statsd-client');
var parseArgs = require('minimist');
var process = require('process');
var assert = require('assert');

var TChannel = require('../channel.js');
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

    var benchRelayHostPort = '127.0.0.1:' + opts.benchRelayPort;
    var traceRelayHostPort = '127.0.0.1:' + opts.traceRelayPort;

    self.relay = TChannel({
        statTags: {
            app: 'relay-server'
        },
        emitConnectionMetrics: false,
        logger: opts.debug ? require('debug-logtron')('relay') : null,
        trace: false,
        statsd: new Statsd({
            host: '127.0.0.1',
            port: 7036
        })
    });

    // // useful for demonstrating tombstone leak
    // var OpKindMonitor = require('../monitor').OpKindMonitor;
    // (new OpKindMonitor(self.relay, {
    //     desc: 'relay',
    //     interval: 5000,
    // })).run();

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

    self.serviceName = opts.type === 'bench-relay' ? 'benchmark' :
        opts.type === 'trace-relay' ? 'tcollector' :
        'unknown';
    self.port = opts.type === 'bench-relay' ? opts.benchRelayPort :
        opts.type === 'trace-relay' ? opts.traceRelayPort :
        null;
    self.targetPort = opts.type === 'bench-relay' ? opts.benchPort :
        opts.type === 'trace-relay' ? opts.tracePort :
        null;

    self.type = opts.type;
    self.instances = opts.instances;

    self.relay.handler.createServiceChannel(self.serviceName);
    self.relay.listen(self.port, '127.0.0.1', onListen);

    function onListen() {
        self.connect();
    }
}

RelayServer.prototype.connect = function connect() {
    var self = this;

    var basePort = parseInt(self.targetPort, 10);

    for (var i = 0; i < self.instances; i++) {
        var targetHostPort = '127.0.0.1:' + (basePort + i);

        var peer = self.relay.handler.getServicePeer(
            self.serviceName, targetHostPort
        );
        peer.connect();
    }
};
