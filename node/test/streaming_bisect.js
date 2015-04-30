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
var test = require('tape');
var util = require('util');
var CountStream = require('./lib/count_stream');
var TestStreamSearch = require('./lib/stream_search');
var base2 = require('./lib/base2');
var StreamCheck = require('./lib/stream_check');

var argv = {
    first: false,
    trace: false,
    instrument: 0
};

if (require.main === module) {
    argv = require('minimist')(process.argv.slice(2), {
        boolean: {
            first: true,
            trace: true,
        },
        default: argv
    });
}

if (argv.repro) {
    var hSize = base2.parse(argv.head);
    var bSize = base2.parse(argv.body);
    if (isNaN(hSize)) die('invalid hSize');
    if (isNaN(bSize)) die('invalid hSize');
    var state = {
        hSize: hSize,
        bSize: bSize,
        timeout: argv.timeout
    };
    test.only(util.format('repro head %s body %s',
        base2.pretty(state.hSize, 'B'),
        base2.pretty(state.bSize, 'B')
    ), function t(assert) {
        var search = TestStreamSearch();
        var spec = search.makeSpec(state);
        search.test(spec, assert);
    });
}

test('bisection test', function t(assert) {
    var sizeLimit = null;

    if (argv.sizeLimit) {
        sizeLimit = base2.parse(argv.sizeLimit);
        if (isNaN(sizeLimit)) die('invalid sizeLimit');
    }

    var search = TestStreamSearch({
        reuseClusterPool: true,
        stopOnFirstFailure: argv.first,
        traceDetails: argv.trace,
        sizeLimit: sizeLimit || 128 * base2.Ki,
        timeout: argv.timeout,
        test: inprocClusterTest
    }).instrument(argv.instrument);

    var firstStop = {};

    async.series([

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

    ].map(function eachOptions(options) {
        return function runThunk(next) {
            search.run(assert, options, function(err, run) {
                if (!err && argv.first && run.fail) {
                    next(firstStop);
                } else {
                    next(err);
                }
            });
        };
    }), function done(err) {
        if (err && err !== firstStop) assert.ifError(err, 'no final error');
        search.clusterPool.destroy(assert.end);
    });
});

function inprocClusterTest(state, assert) {
    // jshint validthis:true
    var self = this;
    var name = self.describeState(state);
    var cluster = null;
    self.clusterPool.get(gotCluster);

    function gotCluster(err, clus) {
        if (err) {
            assert.end(err);
            return;
        }
        cluster = clus;
        streamingEchoTest(cluster, state, assert, finish);
    }

    function finish(err) {
        assert.ifError(err, name + ': no final error');
        if (!err) {
            cluster.assertCleanState(assert, {
                channels: [{
                    peers: [{
                        connections: [
                            {direction: 'in', inReqs: 0, outReqs: 0}
                        ]
                    }]
                }, {
                    peers: [{
                        connections: [
                            {direction: 'out', inReqs: 0, outReqs: 0}
                        ]
                    }]
                }]
            });
        }
        if (!assert._ok) {
            cluster.destroy(assert.end);
        } else {
            self.clusterPool.release(cluster);
            assert.end();
        }
    }
}

function streamingEchoTest(cluster, state, assert, callback) {
    var hSize = state.test.hSize;
    var bSize = state.test.bSize;
    var timeout = state.test.timeout || 100;

    var reqHeadStream = CountStream({limit: hSize});
    var reqBodyStream = CountStream({limit: bSize});

    assert.timeoutAfter(timeout || 100);

    cluster.client.request({
        streamed: true
    }).sendStreams('foo', reqHeadStream, reqBodyStream, onResult);

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

function die() {
    console.error.apply(console, arguments);
    process.exit(1);
}
