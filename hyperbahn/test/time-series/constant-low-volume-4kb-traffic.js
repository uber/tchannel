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
var setTimeout = require('timers').setTimeout;
var path = require('path');

var TimeSeriesCluster = require('./_time-series-cluster.js');

var KILOBYTE = 1024;
var REQUEST_BODY = TimeSeriesCluster.buildString(4 * KILOBYTE);
var REQUEST_BODY_BUFFER = new Buffer(REQUEST_BODY);

var HEAP_FILE_ONE = path.join(
    __dirname,
    path.basename(__filename).split('.')[0] + '-1first-heap.heapsnapshot'
);
var HEAP_FILE_TWO = path.join(
    __dirname,
    path.basename(__filename).split('.')[0] + '-2second-heap.heapsnapshot'
);
var HEAP_FILE_THREE = path.join(
    __dirname,
    path.basename(__filename).split('.')[0] + '-3third-heap.heapsnapshot'
);

TimeSeriesCluster.test('control test for time-series of timeout requests', {
    clusterOptions: {},
    buckets: [
        25, 25, 25, 25, 25, 25
    ],
    clientTimeout: 250,
    endpointToRequest: 'echo-endpoint',
    requestBody: REQUEST_BODY_BUFFER,

    numBatchesInBucket: 100,
    clientBatchDelay: 250,
    clientRequestsPerBatch: 25
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

    var takeHeaps = false;
    var heapdump;
    if (takeHeaps) {
        heapdump = require('heapdump');

        setTimeout(firstHeap, 20 * 1000);
        setTimeout(secondHeap, 40 * 1000);
        setTimeout(thirdHeap, 60 * 1000);
    }

    function onResults(err, results) {
        assert.ifError(err);

        for (var i = 0; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                value: results[i].errorCount,
                min: 0,
                max: 50,
                name: cluster.buckets[i]
            });
        }

        assert.end();
    }

    function firstHeap() {
        console.log('writing first heap');
        heapdump.writeSnapshot(HEAP_FILE_ONE);
    }

    function secondHeap() {
        console.log('writing second heap');
        heapdump.writeSnapshot(HEAP_FILE_TWO);
    }

    function thirdHeap() {
        console.log('writing third heap');
        heapdump.writeSnapshot(HEAP_FILE_THREE);
    }
});
