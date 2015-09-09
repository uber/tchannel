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
var Buffer = require('buffer').Buffer;

var TimeSeriesCluster = require('./_time-series-cluster.js');

var KILOBYTE = 1024;
var REQUEST_BODY = TimeSeriesCluster.buildString(4 * KILOBYTE);
var REQUEST_BODY_BUFFER = new Buffer(REQUEST_BODY);

TimeSeriesCluster.test('control test for time-series of timeout requests', {
    clusterOptions: {},
    buckets: [
        25, 25, 25, 25, 25, 25
    ],
    clientTimeout: 100,
    numBatchesInBucket: 100,
    endpointToRequest: 'echo-endpoint',
    requestBody: REQUEST_BODY_BUFFER
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'error for timed out outgoing response');
    cluster.logger.whitelist('info', 'forwarding expected error frame');
    cluster.logger.whitelist('info', 'expected error while forwarding');
    cluster.logger.whitelist('info', 'OutResponse.send() after inreq timed out');
    cluster.logger.whitelist('warn', 'forwarding error frame');
    cluster.logger.whitelist('warn', 'mismatched conn.onReqDone');

    var count = 0;
    cluster.batchClient.on('batch-updated', function onUpdate(meta) {
        count++;

        if (count % 10 === 0) {
            /* eslint no-console:0 */
            console.log('batch updated', {
                batch: meta.batch
            });
        }
    });

    cluster.sendRequests(onResults);

    function onResults(err, results) {
        assert.ifError(err);

        for (var i = 0; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                value: results[i].errorCount,
                min: 0,
                max: 0,
                name: cluster.buckets[i]
            });
        }

        assert.end();
    }
});
