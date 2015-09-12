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

var TimeSeriesCluster = require('../lib/time-series-cluster.js');

TimeSeriesCluster.test('control test for time-series of timeout requests', {
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
    clientTimeout: 100,
    endpointToRequest: 'echo-endpoint',
    requestBody: TimeSeriesCluster.buildString(10),

    clientInstances: 1,
    clientBatchDelay: 100,
    numBatchesInBucket: 25,
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
        .serviceProxy.rateLimiter.updateTotalLimit(50);

    // cluster.printBatches();

    cluster.sendRequests(onResults);

    function onResults(err, results) {
        assert.ifError(err);

        for (var i = 1; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                value: results[i].errorCount,
                min: 0,
                max: 0,
                description: ' error rate ',
                index: i
            });
        }

        var logLines = cluster.logger.items();
        var rateLimits = logLines.filter(isRateLimit);
        assert.ok(rateLimits.length >= 50,
            'expect at least 50 attempts to be rate limited');

        assert.ok(rateLimits.every(function checkLog(r) {
            return r.fields.rpsLimit === 50;
        }), 'rate limit should be 50');

        assert.end();
    }
});

function isRateLimit(logRecord) {
    return logRecord.fields.msg === 'hyperbahn node is rate-limited by the total rps limit';
}
