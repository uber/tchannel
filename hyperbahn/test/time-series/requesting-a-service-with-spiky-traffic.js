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

/*
    TODO; tests again with circuits on
    TODO; tests again with rate limiter on
    TODO; tests again with circuits + rate limiter on
*/

var TimeSeriesCluster = require('../lib/time-series-cluster.js');

/*  Run a large ring that talks to K instances

For each instance K there should be spikes in timeouts to
hit the circuit breaker

Over a four second period:

 - 0-0.5 75 requests (15 per 100ms bucket)
 - 0.5-1 75 requests (15 per 100ms bucket)
 - 1-1.5 75 requests (15 per 100ms bucket)
 - 1.5-2 75 requests (15 per 100ms bucket)
 - 2-2.5 75 requests (15 per 100ms bucket)
 - 2.5-3 75 requests (15 per 100ms bucket)
 - 3-3.5 75 requests (15 per 100ms bucket)
 - 3.5-4 75 requests (15 per 100ms bucket)

Over a four second period:

 - 0-0.5 300ms + fuzz
 - 0.5-1 500ms + fuzz
 - 1-1.5 600ms + fuzz
 - 1.5-2 500ms + fuzz
 - 2-2.5 425ms + fuzz
 - 2.5-3 300ms + fuzz
 - 3-3.5 425ms + fuzz
 - 3.5-4 450ms + fuzz

*/
TimeSeriesCluster.test('control test for time-series of timeout requests', {
    clusterOptions: {},
    buckets: [
        300, 500, 600, 500, 425, 300, 425, 450
    ],
    clientTimeout: 500,
    endpointToRequest: 'slow-endpoint'
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

    // Stays here.
    var RANGES = {
        '300': [0, 40],
        '425': [2, 40],
        '450': [5, 50],
        '500': [25, 80],
        '600': [50, 99]
    };

    var MIN_ERRORS = [];
    var MAX_ERRORS = [];

    for (var k = 0; k < cluster.buckets.length; k++) {
        var val = cluster.buckets[k];
        MIN_ERRORS[k] = RANGES[val][0];
        MAX_ERRORS[k] = RANGES[val][1];
    }

    cluster.sendRequests(onResults);

    function onResults(err, results) {
        assert.ifError(err);

        for (var i = 0; i < cluster.buckets.length; i++) {
            cluster.assertRange(assert, {
                value: results[i].errorCount,
                min: MIN_ERRORS[i],
                max: MAX_ERRORS[i],
                index: i,
                description: ' reqs with timeout of ' + cluster.buckets[i]
            });
        }

        assert.end();
    }
});
