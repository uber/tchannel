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

var console = require('console');

var TimeSeriesCluster = require('../lib/time-series-cluster.js');

// 14 is a magic number for zero errors + >25 rate limits.
var OVERLOADED_WORKER_RATELIMIT = 14;

/* End to end test to ensure that retries on Busy work as expected.

    The semantics we want is that when a single Hyperbahn worker
    is busy an edge client will use retries to "maneouver" around
    that worker and get 100% success rate.

    We create a TimeSeriesCluster with:

     - 10 hyperbahn worker nodes
     - rate limiting set to 200 per worker.
     - We split the test run into 4 buckets
     - We want one client to have deterministic peer selection
     - We want 250 req/s split between 10 workers
     - We manually set the first bucket to 100 req/s to warm
        up the entire cluster

    Once our test finishes we expect:

     - All requests to succeed
     - To get at least 2% of requests to be rate limited

*/
TimeSeriesCluster.test('testing worker with low rate limit', {
    clusterOptions: {
        size: 10,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.totalRpsLimit': 200,
            'rateLimiting.rpsLimitForServiceName': {
                'time-series-server': 800
            }
        }
    },
    buckets: [
        25, 25, 25, 25
    ],
    clientTimeout: 500,
    endpointToRequest: 'echo-endpoint',
    requestBody: TimeSeriesCluster.buildString(10),

    clientInstances: 1,
    clientBatchDelay: 100,
    numBatchesInBucket: 10,
    clientRequestsPerBatch: 25,
    clientRequestsPerBatchForFirstBucket: 10
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'error for timed out outgoing response');
    cluster.logger.whitelist('info', 'forwarding expected error frame');
    cluster.logger.whitelist('info', 'expected error while forwarding');
    cluster.logger.whitelist('info', 'OutResponse.send() after inreq timed out');
    cluster.logger.whitelist('warn', 'forwarding error frame');
    cluster.logger.whitelist('warn', 'mismatched conn.onReqDone');
    cluster.logger.whitelist('info', 'ignoring outresponse.send on a closed connection');
    cluster.logger.whitelist('info', 'ignoring outresponse.sendError on a closed connection');
    cluster.logger.whitelist('info', 'popOutReq received for unknown or lost id');
    cluster.logger.whitelist('info', 'hyperbahn node is rate-limited by the total rps limit');

    // Set rate on a single Hyperbahn worker
    cluster._cluster.apps[4].clients
        .serviceProxy.rateLimiter.updateTotalLimit(10);

    // cluster.printBatches();

    cluster.sendRequests(onResults);

    function onResults(err, results) {
        assert.ifError(err);

        // Ignore first bucket as it's the warmup bucket
        // which is a statistical outlier for this test.
        for (var i = 1; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                value: results[i].errorCount,
                min: 0,
                max: 0,
                description: ' error rate ',
                index: i
            });

            if (results[i].errorCount > 0) {
                /* eslint no-console: 0 */
                console.log('# results', results[i]);
            }
        }

        var logLines = cluster.logger.items();

        // We made 250 req/s for 4 seconds. We expect at least
        // 1 requests out of a 1000 to be rate limited by
        // worker[4]
        var rateLimits = logLines.filter(isRateLimit);
        assert.ok(rateLimits.length >= 1,
            'expect at least 1 attempts to be rate limited ' +
            'but is: ' + rateLimits.length);

        assert.ok(rateLimits.every(function checkLog(r) {
            if (r.meta.rpsLimit !== OVERLOADED_WORKER_RATELIMIT) {
                console.log('wat', r.meta);
            }

            return r.meta.rpsLimit === OVERLOADED_WORKER_RATELIMIT;
        }), 'rate limit should be ' + OVERLOADED_WORKER_RATELIMIT);

        assert.end();
    }
});

function isRateLimit(logRecord) {
    return logRecord.msg === 'hyperbahn node is rate-limited by the total rps limit';
}
