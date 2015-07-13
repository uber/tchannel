// Copyright (c) 2015 Uber Technologies, Inc.
//
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

/* HOWDO:
 *
 * Step 1: is there any failures to care about?
 *     $ node test/streaming_bisect.js
 *     ...
 *     # Isolated 4 failures
 *     # - head 31KiB + 965B body 64KiB
 *     # - head 431KiB + 1001B body 64KiB
 *     # - head 423KiB + 1023B body 128KiB
 *     # - head 437KiB + 17B body 512KiB
 *     ...
 *
 * Step 2: get detail on the first failure
 *     $ node test/streaming_bisect.js --trace --first
 *     ...
 *     # Failure #1: head 31KiB + 966B body 64KiB
 *     # Last good at: head 31KiB + 965B body 64KiB
 *     ... much detail ...
 *
 * Step 3: analyze the difference between good and bad
 *     $ NODE_DEBUG=tchannel,tchannel_dump node test/streaming_bisect.js \
 *         --repro --head '31KiB + 965B' --body '64KiB' --timeout 1000 2>&1 \
 *         | ./test/streaming_bisect_relabel.sh \
 *         >good
 *
 *     $ NODE_DEBUG=tchannel,tchannel_dump node test/streaming_bisect.js \
 *         --repro --head '31KiB + 966B' --body 64KiB --timeout 1000 2>&1 \
 *         | ./test/streaming_bisect_relabel.sh \
 *         >bad
 *
 *     $ diff -y good bad
 *     # or any other diff viewer
 */

var async = require('async');
var CountedReadySignal = require('ready-signal/counted');
var extend = require('xtend');
var minimist = require('minimist');
var util = require('util');

var clusterSearch = require('./lib/cluster_search');
var CountStream = require('./lib/count_stream');
var StreamCheck = require('./lib/stream_check');
var base2 = require('./lib/base2');
var setupRawTestService = require('./lib/raw_service');

/*
 * This is the test function that gets run one or more (very many more) times.
 *
 * Arguments:
 * - cluster -- an initialized "cluster" object, that has initialized channels,
 *   see test/lib/cluster_search.js for details
 * - state -- parameters to test, shape: {
 *     hSize   :: Integer, // how many bytes to send in arg2 (the "head")
 *     bSize   :: Integer, // how many bytes to send in arg3 (the "body")
 *     timeout :: Integer, // ms time limit for this test
 *   }
 * - assert -- a test assert object for just this round
 * - callback -- call this when done, NOT assert.end
 */
function streamingEchoTest(cluster, state, assert, callback) {
    var hSize = state.test.hSize;
    var bSize = state.test.bSize;
    var timeout = state.test.timeout || 100;

    var reqHeadStream = CountStream({limit: hSize});
    var reqBodyStream = CountStream({limit: bSize});

    assert.timeoutAfter(timeout || 100);

    cluster.testRawClient.request({
        serviceName: 'test_as_raw',
        hasNoParent: true,
        headers: {
            as: 'raw',
            cn: 'wat'
        },
        streamed: true
    }).sendStreams('streaming_echo', reqHeadStream, reqBodyStream, onResult);

    function onResult(err, req, res) {
        var arg2Check = new StreamCheck('arg2', assert, CountStream({limit: hSize}));
        var arg3Check = new StreamCheck('arg3', assert, CountStream({limit: bSize}));
        if (err) {
            callback(err);
        } else if (res.streamed) {
            async.series([
                arg2Check.verifyStream(res.arg2),
                arg3Check.verifyStream(res.arg3),
            ], callback);
        } else {
            arg2Check.verifyChunk(0, res.arg2);
            arg2Check.verifyDrained();
            arg3Check.verifyChunk(0, res.arg3);
            arg3Check.verifyDrained();
            callback();
        }
    }
}

/*
 * The basic idea (outside of repro mode) is:
 * - for each setting
 *   - init(setting)
 *   - while we have a state to explore
 *     - new sub-assert
 *     - get or create a cluster
 *       - clusterTest(cluster, state, assert, callback)
 *       - if the test didn't fail and left the cluster in a clean state,
 *         mark it for re-use
 *       - explore or isolate based on the outcome
 */


var argv = {};

if (require.main === module) {
    argv = minimist(process.argv.slice(2), {
        boolean: {
            first: true,
            trace: true
        }
    });
    if (typeof argv.sizeLimit === 'string') {
        argv.sizeLimit = base2.parse(argv.sizeLimit);
        if (isNaN(argv.sizeLimit)) die('invalid sizeLimit');
    }
}

var search = clusterSearch.ClusterIsolateSearch(extend({
    title: 'streaming bisection',

    reuseChannels: true,

    sizeLimit: 128 * base2.Ki,

    // The settings to run with when not in repro mode
    //
    // Each entry in this array will result in a search.run(settings), so each
    // of these are a set of initial parameters.
    testSettings: [

        {
            withHeaderOnly: true,
            withBodyOnly: true,
            withBoth: true,
            basis: [0, 1],
            mul: []
        },

        {
            withHeaderOnly: true,
            withBodyOnly: true,
            withBoth: true,
            basis: [2]
        },

        {
            withHeaderOnly: true,
            withBodyOnly: true,
            withBoth: true,
            basis: [3]
        },

        {
            // TODO: basis length >= 2 && withBoth causes non-deterministic
            // timeout failures (even with setting maxTries > 1); however none
            // of these failures are ever reproducible...
            // basis: [2, 3, 5, 7, 11, 13],
            withHeaderOnly: true,
            withBodyOnly: true,
            withBoth: false,
            basis: [2, 3]
        }

    ],

    // parses the particular repro state from argv-extended options
    reproState: function reproState(options) {
        var hSize = base2.parse(options.head);
        var bSize = base2.parse(options.body);
        if (isNaN(hSize)) die('invalid hSize');
        if (isNaN(bSize)) die('invalid hSize');
        return {
            test: {
                hSize: hSize,
                bSize: bSize,
                timeout: options.timeout
            }
        };
    },

    // the actual test function to run
    clusterTest: streamingEchoTest,

    // options for creating an in-process "cluster"
    // see clusterSearch.inprocClusterCreator for details
    inprocOptions: {
        init: function setupInprocCluster(cluster, callback) {
            cluster.channels.forEach(function each(channel) {
                if (channel !== cluster.client) {
                    setupRawTestService(channel);
                }
            });
            callback(null);
        }
    },

    // creates a client for the test service
    setupClient: function setupClient(cluster, callback) {
        cluster.testRawClient = cluster.client.makeSubChannel({
            peers: cluster.client.peers.values().map(function h(p) {
                return p.hostPort;
            }),
            serviceName: 'test_as_raw',
            requestDefaults: {
                serviceName: 'test_as_raw',
            }
        });
        var peers = cluster.testRawClient.peers.values();
        var ready = new CountedReadySignal(peers.length);
        peers.forEach(function each(peer) {
            peer.connect().on('identified', ready.signal);
        });
        ready(function onReady() {
            callback(null);
        });
    },

    // pretty printer
    describeState: function describeState(state) {
        return util.format('head %s body %s',
            base2.pretty(state.test.hSize, 'B'),
            base2.pretty(state.test.bSize, 'B'));
    },

    // TODO: predecessor had seemingly unused
    // function describeNoFailure(assert) {
    //     var self = this;
    //     var limit = base2.pretty(self.options.sizeLimit, 'B');
    //     assert.pass('found no failure under ' + limit);
    // }

    // initialize the search space by calling self.expand
    init: function initSearchState() {
        var self = this;

        // noop, shouldn't even get called in repro mode
        if (self.options.repro) return;

        self.expand(function(_emit) {
            var base = {hSize: 0, bSize: 0, timeout: self.options.timeout};
            self.options.basis.forEach(function each(n) {
                if (self.options.withHeaderOnly) emit({hSize: n});
                if (self.options.withBodyOnly) emit({bSize: n});
                if (self.options.withBoth) emit({hSize: n, bSize: n});
            });
            function emit(overlay) {
                _emit(self.makeSpec(extend(base, overlay)));
            }
        });
    },

    // called under self.expand after each passed test to expand the search space
    explore: function explore(spec, _emit) {
        var self = this;
        var good = spec.good.test;
        (self.options.mul || self.options.basis).forEach(function each(n) {
            if (n < 2) return;
            var hSize = n * good.hSize;
            var bSize = n * good.bSize;
            if (hSize <= self.options.sizeLimit) emit({hSize: hSize});
            if (bSize <= self.options.sizeLimit) emit({bSize: bSize});
        });
        function emit(overlay) {
            _emit(spec.makeTest(extend(good, overlay)));
        }
    },

    // called under self.expand after failed test to expand the search space
    isolate: function isolate(spec, _emit) {
        var good = spec.good && spec.good.test || {hSize: 0, bSize: 0};
        var bad = spec.bad.test;
        if (bad.hSize - good.hSize > 1) emit({hSize: mid(good.hSize, bad.hSize)});
        if (good.bSize < bad.bSize) emit({bSize: mid(good.bSize, bad.bSize)});
        function emit(overlay) {
            _emit(spec.makeTest(extend(good, overlay)));
        }
        function mid(a, b) {
            return a + Math.floor(b / 2 - a / 2);
        }
    },

    // used to prune the search space, implements an equivalence relation on states
    willFailLike: function willFailLike(a, b) {
        if (like(a, b)) return true;
        for (var i = 0; i < b.trace.length; i++) {
            var res = b.trace[i];
            if (res.fail && like(a, res.state)) return true;
        }
        return false;
        function like(a, b) {
            if (a.test.hSize !== b.test.hSize) return false;
            if (a.test.bSize < b.test.bSize) return false;
            return true;
        }
    }
}, argv));
search.runTestHarness();

function die() {
    console.error.apply(console, arguments);
    process.exit(1);
}
