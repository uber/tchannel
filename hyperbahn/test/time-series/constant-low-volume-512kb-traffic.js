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

var Buffer = require('buffer').Buffer;

var TimeSeriesCluster = require('../lib/time-series-cluster.js');

var KILOBYTE = 1024;
var REQUEST_BODY = TimeSeriesCluster.buildString(128 * KILOBYTE);
var REQUEST_BODY_CHUNKS = [
    new Buffer(REQUEST_BODY),
    new Buffer(REQUEST_BODY),
    new Buffer(REQUEST_BODY),
    new Buffer(REQUEST_BODY)
];

TimeSeriesCluster.test('constant low volume 512kb traffic', {
    clusterOptions: {},
    buckets: [
        25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25, 25
    ],
    clientTimeout: 250,
    endpointToRequest: 'streaming-echo-endpoint',
    // requestBody: new Buffer(TimeSeriesCluster.buildString(512 * KILOBYTE)),
    requestBodyChunks: REQUEST_BODY_CHUNKS,

    numBatchesInBucket: 50,
    clientBatchDelay: 400,
    clientRequestsPerBatch: 10
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'error for timed out outgoing response');
    cluster.logger.whitelist('info', 'forwarding expected error frame');
    cluster.logger.whitelist('info', 'expected error while forwarding');
    cluster.logger.whitelist('info', 'OutResponse.send() after inreq timed out');
    cluster.logger.whitelist('warn', 'forwarding error frame');
    cluster.logger.whitelist('warn', 'mismatched conn.onReqDone');

    cluster.printBatches();

    // cluster.sendRequests(onResults);
    cluster.sendStreamingRequests(onResults);

    var shouldTakeHeaps = false;
    if (shouldTakeHeaps) {
        cluster.takeHeaps(20, 40, 60);
    }

    function onResults(err, results) {
        assert.ifError(err);

        // Skip bucket 0 because JIT warmup
        for (var i = 1; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                index: i,
                value: results[i].errorCount,
                min: 0,
                max: 50,
                description: ' reqs with timeout of ' + cluster.buckets[i]
            });
            cluster.assertRange(assert, {
                index: i,
                value: results[i].latency.p95,
                min: 100,
                max: 140,
                description: ' p95 of requests '
            });
            cluster.assertRange(assert, {
                index: i,
                value: results[i].processMetrics.heapTotal,
                min: 50,
                max: 90,
                description: ' heap size of process '
            });
            cluster.assertRange(assert, {
                index: i,
                value: results[i].processMetrics.rss,
                min: 300,
                max: 420,
                description: ' RSS of process '
            });
        }

        assert.end();
    }
});
