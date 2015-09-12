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

var tapeCluster = require('tape-cluster');
var setTimeout = require('timers').setTimeout;
var parallel = require('run-parallel');
var tape = require('tape');
var nodeAssert = require('assert');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var process = require('process');
var metrics = require('metrics');
var console = require('console');
var path = require('path');

var HyperbahnCluster = require('../lib/test-cluster.js');

var startOfFile = Date.now();

TimeSeriesCluster.test = tapeCluster(tape, TimeSeriesCluster);

TimeSeriesCluster.buildString = function buildString(size) {
    var tempArray = [];

    for (var i = 0; i < size; i++) {
        tempArray.push('A');
    }

    return tempArray.join('');
};

module.exports = TimeSeriesCluster;

/*  TimeSeriesCluster is a hyperbahn worker cluster that comes
    pre-configured with a batch client and a time series remote
    to enable the authoring of test that repeat certain types
    of requests over time.

    The idea is that you configure it with

     - what type of request to make
     - what volume and rate of requests
     - what type of semantics should the TimeSeriesRemote have

    And then tell it to run tests for a few seconds or a few
    minutes.

    Once you are done sending tests you will get back a list of
    BatchClientBucket objects which contain statistics of the
    latency and error rate for all the requests in that bucket.

     - `opts.buckets` A list of values for each batch. The
        number of buckets is the number of batches you want
     - `opts.clientTimeout` ttl of outgoing requests
     - `opts.endpointToRequest` endpoint name to use in client
     - `opts.clientBatchDelay` wait period between each batch
        of requests in a bucket
     - `opts.numBatchesInBucket` the number of batches per bucket.
     - `opts.serverInstances` number of instances of the TimeSeriesRemote
     - `opts.clientInstances` number of tchannel clients used
        by the BatchClient
     - `opts.requestBody` the arg3 for any non-streaming reqs
     - `opts.requestBodyChunks` an array of buffers used
        by the streaming requests in the BatchClient

*/
function TimeSeriesCluster(opts) {
    /* eslint max-statements: [2, 40] */
    /* eslint max-complexity: [2, 20] */
    if (!(this instanceof TimeSeriesCluster)) {
        return new TimeSeriesCluster(opts);
    }

    var self = this;

    nodeAssert(opts && opts.buckets, 'requires buckets');
    nodeAssert(opts && opts.clientTimeout, 'requires clientTimeout');
    nodeAssert(opts && opts.endpointToRequest, 'requires endpointToRequest');
    self.buckets = opts.buckets;
    self.clientTimeout = opts.clientTimeout;
    self.endpointToRequest = opts.endpointToRequest;

    self.clientBatchDelay = opts.clientBatchDelay || 100;
    self.numBatchesInBucket = opts.numBatchesInBucket || 5;
    self.clientRequestsPerBatch = opts.clientRequestsPerBatch || 15;
    self.clientRequestsPerBatchForFirstBucket = opts.clientRequestsPerBatchForFirstBucket || 10;
    self.serverInstances = opts.serverInstances || 10;
    self.clientInstances = opts.clientInstances || 5;
    self.requestBody = opts.requestBody || '';
    self.requestBodyChunks = opts.requestBodyChunks || [];

    self.serverServiceName = 'time-series-server';
    self.clientServiceName = 'time-series-client';

    self.namedRemotes = [];
    for (var sIndex = 0; sIndex < self.serverInstances; sIndex++) {
        self.namedRemotes.push(self.serverServiceName);
    }
    for (var cIndex = 0; cIndex < self.clientInstances; cIndex++) {
        self.namedRemotes.push(self.clientServiceName);
    }

    self.clusterOptions = null;
    self.setupClusterOptions(opts);

    self._cluster = HyperbahnCluster(self.clusterOptions);
    self.logger = self._cluster.logger;

    self.timeWindow = TimeWindow({
        start: Date.now(),

        buckets: self.buckets,
        interval: self.clientBatchDelay * self.numBatchesInBucket
    });

    self.batchClient = null;
}

TimeSeriesCluster.prototype.setupClusterOptions =
function setupClusterOptions(opts) {
    var self = this;

    self.clusterOptions = opts.clusterOptions || {};
    if (!self.clusterOptions.size) {
        self.clusterOptions.size = 10;
    }
    if (!self.clusterOptions.remoteConfig) {
        self.clusterOptions.remoteConfig = {};
    }
    if (!self.clusterOptions.remoteConfig['kValue.default']) {
        self.clusterOptions.remoteConfig['kValue.default'] = 4;
    }
    if (!('rateLimiting.enabled' in self.clusterOptions.remoteConfig)) {
        self.clusterOptions.remoteConfig['rateLimiting.enabled'] = false;
    }
    if (!('hyperbahn.circuits' in self.clusterOptions.remoteConfig)) {
        self.clusterOptions.remoteConfig['hyperbahn.circuits'] = {
            period: 100,
            maxErrorRate: 0.5,
            minRequests: 5,
            probation: 5,
            enabled: false
        };
    }
    if (!('kValue.services' in self.clusterOptions.remoteConfig)) {
        // Force fully connected client
        self.clusterOptions.remoteConfig['kValue.services'] = {
            'time-series-client': self.clusterOptions.size * 3
        };
    }

    self.clusterOptions.namedRemotes = self.namedRemotes;
};

TimeSeriesCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    self._cluster.logger.whitelist(
        'info', '[remote-config] config file changed'
    );

    self._cluster.bootstrap(onCluster);

    function onCluster(err) {
        if (err) {
            return cb(err);
        }

        var serverRemotes = self._cluster.namedRemotes.slice(
            0, self.serverInstances
        );

        for (var i = 0; i < serverRemotes.length; i++) {
            TimeSeriesRemote(serverRemotes[i], self.timeWindow, 'remote ' + i);
        }

        var clientRemotes = self._cluster.namedRemotes.slice(
            self.serverInstances, self.serverInstances + self.clientInstances
        );

        self.batchClient = BatchClient({
            remotes: clientRemotes,
            requestsPerBatch: self.clientRequestsPerBatch,
            requestsPerBatchForFirstBucket: self.clientRequestsPerBatchForFirstBucket,
            clientBatchDelay: self.clientBatchDelay,
            clientTimeout: self.clientTimeout,
            numBatchesInBucket: self.numBatchesInBucket,
            numBuckets: self.buckets.length,
            endpoint: self.endpointToRequest,
            clientServiceName: self.clientServiceName,
            serverServiceName: self.serverServiceName,
            body: self.requestBody,
            bodyChunks: self.requestBodyChunks
        });

        cb(null);
    }
};

TimeSeriesCluster.prototype.printBatches = function printBatches() {
    var self = this;

    var count = 0;
    self.batchClient.on('batch-updated', function onUpdate(meta) {
        count++;

        if (count % 10 === 0) {
            /* eslint no-console:0 */
            console.log('batch updated', meta);
        }
    });
};

TimeSeriesCluster.prototype.sendRequests = function sendRequests(cb) {
    var self = this;

    self.timeWindow.setTimer();
    self.batchClient.sendRequests(Date.now(), cb);
};

TimeSeriesCluster.prototype.sendStreamingRequests =
function sendStreamingRequests(cb) {
    var self = this;

    self.timeWindow.setTimer();
    self.batchClient.sendStreamingRequests(Date.now(), cb);
};

TimeSeriesCluster.prototype.close = function close(cb) {
    var self = this;

    self._cluster.close(cb);
};

TimeSeriesCluster.prototype.assertRange = function assertRange(assert, options) {
    assert.ok(options.value >= options.min,
        'in batch ( ' + options.index + ' ) count (' +
        options.value + ') for' + options.description +
        ' should be greater than >= ' + options.min);
    assert.ok(options.value <= options.max,
        'in batch ( ' + options.index + ' ) count (' +
        options.value + ') for' + options.description +
        ' should be less than <= ' + options.max);
};

TimeSeriesCluster.prototype.takeHeaps =
function takeHeaps(delayOne, delayTwo, delayThree) {
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

    var heapdump = require('heapdump');

    setTimeout(firstHeap, delayOne * 1000);
    setTimeout(secondHeap, delayTwo * 1000);
    setTimeout(thirdHeap, delayThree * 1000);

    function firstHeap() {
        /* eslint no-console:0 */
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
};

function BatchClient(options) {
    if (!(this instanceof BatchClient)) {
        return new BatchClient(options);
    }

    var self = this;
    EventEmitter.call(self);

    self.serverServiceName = options.serverServiceName;
    self.clientServiceName = options.clientServiceName;
    self.requestsPerBatch = options.requestsPerBatch;
    self.requestsPerBatchForFirstBucket = options.requestsPerBatchForFirstBucket;
    self.clientBatchDelay = options.clientBatchDelay;
    self.numBuckets = options.numBuckets;

    self.numBatchesInBucket = options.numBatchesInBucket;

    self.clientTimeout = options.clientTimeout;
    self.endpoint = options.endpoint;

    self.timeWindow = options.timeWindow;
    self.channels = [];
    for (var i = 0; i < options.remotes.length; i++) {
        self.channels.push(options.remotes[i].clientChannel);
    }

    self.requestVolume = ((self.numBuckets - 1) * (
        self.numBatchesInBucket * self.requestsPerBatch
    )) + (self.numBatchesInBucket * self.requestsPerBatchForFirstBucket);

    self.body = options.body || '';
    self.bodyChunks = options.bodyChunks || [];
    self.requestOptions = {
        serviceName: self.serverServiceName,
        timeout: self.clientTimeout,
        headers: {
            'as': 'raw',
            'cn': self.clientServiceName
        }
    };
    self.streamingRequestOptions = {
        serviceName: self.serverServiceName,
        streamed: true,
        timeout: self.clientTimeout,
        headers: {
            'as': 'raw',
            'cn': self.clientServiceName
        }
    };
    self.streamWriteDelay = 10;

    self.freeList = new Array(self.requestVolume);
    for (var j = 0; j < self.requestVolume; j++) {
        self.freeList[j] = new BatchClientRequestResult();
    }
}
util.inherits(BatchClient, EventEmitter);

BatchClient.prototype.sendRequests = function sendRequests(now, cb) {
    var self = this;

    var loop = new BatchClientLoop({
        start: now,
        batchClient: self,
        onFinish: cb
    });
    loop.runNext();
};

BatchClient.prototype.sendStreamingRequests =
function sendStreamingRequests(now, cb) {
    var self = this;

    var loop = new BatchClientLoop({
        start: now,
        batchClient: self,
        streamed: true,
        onFinish: cb
    });
    loop.runNext();
};

BatchClient.prototype._sendRequestStream =
function _sendRequestStream(cb) {
    var self = this;

    var start = Date.now();
    var randomClient = self.channels[
        Math.floor(Math.random() * self.channels.length)
    ];

    var req = randomClient.request(self.streamingRequestOptions);
    req.hookupStreamCallback(onStreamingResponse);

    req.sendArg1(self.endpoint);
    req.arg2.end('');

    var bodyChunks = self.bodyChunks.slice();
    writeLoop();

    function writeLoop() {
        if (bodyChunks.length === 0) {
            return req.arg3.end();
        }

        var chunk = bodyChunks.shift();
        req.arg3.write(chunk);

        setTimeout(writeLoop, self.streamWriteDelay);
    }

    function onStreamingResponse(err1, _, resp) {
        var result;

        if (err1) {
            result = self.freeList.pop();

            result.error = err1;
            result.responseOk = false;
            result.duration = Date.now() - start;
            return cb(null, result);
        }

        resp.withArg23(onBuffers);

        function onBuffers(err2) {
            result = self.freeList.pop();

            result.error = err2 || null;
            result.responseOk = resp ? resp.ok : false;
            result.duration = Date.now() - start;

            // console.log('got response', {
            //     err: !!err
            // });
            cb(null, result);
        }
    }
};

BatchClient.prototype._sendRequest = function _sendRequest(cb) {
    var self = this;

    var start = Date.now();
    var randomClient = self.channels[
        Math.floor(Math.random() * self.channels.length)
    ];

    var req = randomClient.request(self.requestOptions);
    req.send(self.endpoint, '', self.body, onResponse);

    function onResponse(err, resp) {
        var result = self.freeList.pop();

        result.error = err || null;
        result.responseOk = resp ? resp.ok : false;
        result.duration = Date.now() - start;

        // console.log('got response', {
        //     err: !!err
        // });
        cb(null, result);
    }
};

function BatchClientLoop(options) {
    var self = this;

    self.batchClient = options.batchClient;
    self.startTime = options.start;
    self.onFinish = options.onFinish;
    self.streamed = options.streamed;

    self.resultBuckets = new Array(self.batchClient.numBuckets);
    self.bucketIndex = 0;
    self.currentBatch = 0;
    self.responseCounter = 0;

    for (var k = 0; k < self.batchClient.numBuckets; k++) {
        var size;
        if (k === 0) {
            size = self.batchClient.requestsPerBatchForFirstBucket *
                self.batchClient.numBatchesInBucket;
        } else {
            size = self.batchClient.requestsPerBatch *
                self.batchClient.numBatchesInBucket;
        }
        self.resultBuckets[k] = new BatchClientBucket(size);
    }

    self.boundSendRequest = boundSendRequest;
    self.boundSendStreamingRequest = boundSendStreamingRequest;
    self.boundRunAgain = boundRunAgain;

    function boundSendRequest(callback) {
        self.batchClient._sendRequest(callback);
    }

    function boundSendStreamingRequest(callback) {
        self.batchClient._sendRequestStream(callback);
    }

    function boundRunAgain() {
        self.runNext();
    }
}

BatchClientLoop.prototype.runNext = function runNext() {
    var self = this;

    if (self.bucketIndex >= self.batchClient.numBuckets) {
        return null;
    }

    var thunks = [];

    var requestsPerBatch;
    if (self.bucketIndex === 0) {
        requestsPerBatch = self.batchClient.requestsPerBatchForFirstBucket;
    } else {
        requestsPerBatch = self.batchClient.requestsPerBatch;
    }

    for (var i = 0; i < requestsPerBatch; i++) {
        if (self.streamed) {
            thunks.push(self.boundSendStreamingRequest);
        } else {
            thunks.push(self.boundSendRequest);
        }
    }

    var batchResult = self.resultBuckets[self.bucketIndex];

    self.batchClient.emit('batch-updated', {
        index: self.bucketIndex,
        batch: batchResult
    });
    batchResult.touch();

    self.currentBatch += 1;
    if (self.currentBatch % self.batchClient.numBatchesInBucket === 0) {
        self.bucketIndex++;
    }

    parallel(thunks, onResults);

    var targetTime = self.startTime + (
        self.currentBatch * self.batchClient.clientBatchDelay
    );
    var delta = targetTime - Date.now();

    setTimeout(self.boundRunAgain, delta);

    function onResults(err, responses) {
        if (err) {
            return self.onFinish(err);
        }

        for (var j = 0; j < responses.length; j++) {
            self.responseCounter++;
            batchResult.push(responses[j]);
        }

        if (self.responseCounter >= self.batchClient.requestVolume) {
            self.onFinish(null, self.resultBuckets);
        }
    }
};

function BatchClientRequestResult() {
    var self = this;

    self.error = null;
    self.responseOk = null;
    self.duration = null;
}

function asMegaBytes(num) {
    return Math.ceil(num / (1024 * 1024));
}

function BatchClientBucket(size) {
    if (!(this instanceof BatchClientBucket)) {
        return new BatchClientBucket(size);
    }

    var self = this;

    self._results = new Array(size);

    self.totalCount = 0;
    self.errorCount = 0;
    self.successCount = 0;
    self.timeoutCount = 0;
    self.declinedCount = 0;

    self.byType = {};

    self.processMetrics = {
        rss: null,
        heapTotal: null,
        heapUsed: null
    };
    self._latencyHistogram = new metrics.Histogram();
    self.latency = {
        min: null,
        median: null,
        p75: null,
        p95: null,
        p99: null,
        max: null
    };
}

BatchClientBucket.prototype.touch = function touch() {
    var self = this;

    var memoryUsage = process.memoryUsage();

    self.processMetrics.rss = asMegaBytes(memoryUsage.rss);
    self.processMetrics.heapTotal = asMegaBytes(memoryUsage.heapTotal);
    self.processMetrics.heapUsed = asMegaBytes(memoryUsage.heapUsed);

    var latencyObject = self._latencyHistogram.printObj();

    self.latency.min = latencyObject.min;
    self.latency.median = latencyObject.median;
    self.latency.p75 = Math.ceil(latencyObject.p75);
    self.latency.p95 = Math.ceil(latencyObject.p95);
    self.latency.p99 = Math.ceil(latencyObject.p99);
    self.latency.max = latencyObject.max;
};

BatchClientBucket.prototype.push = function push(result) {
    var self = this;

    self._results.push(result);
    self._latencyHistogram.update(result.duration);

    self.totalCount++;
    if (result.error) {
        self.errorCount++;

        if (self.byType[result.error.type] === undefined) {
            self.byType[result.error.type] = 0;
        }
        self.byType[result.error.type]++;
        // console.log('err type', result.error.type);
    } else {
        self.successCount++;
    }
};

BatchClientBucket.prototype.inspect = function inspect() {
    var self = this;

    return require('util').inspect({
        totalCount: self.totalCount,
        errorCount: self.errorCount,
        successCount: self.successCount,
        timeoutCount: self.timeoutCount,
        declinedCount: self.declinedCount,
        byType: self.byType,
        processMetrics: self.processMetrics,
        secondsElapsed: Math.ceil((Date.now() - startOfFile) / 1000),
        latency: self.latency
    });
};

function TimeSeriesRemote(remote, timers, name) {
    if (!(this instanceof TimeSeriesRemote)) {
        return new TimeSeriesRemote(remote, timers, name);
    }

    var self = this;

    self.timers = timers;
    self.channel = remote.serverChannel;
    self.name = name;

    self.channel.register('slow-endpoint', slowEndpoint);
    self.channel.register('echo-endpoint', echoEndpoint);
    self.channel.register('health-endpoint', healthEndpoint);
    self.channel.register('streaming-echo-endpoint', {
        streamed: true
    }, streamingEchoEndpoint);

    function slowEndpoint(req, res, arg2, arg3) {
        self.slowEndpoint(req, res, arg2, arg3);
    }

    function echoEndpoint(req, res, arg2, arg3) {
        self.echoEndpoint(req, res, arg2, arg3);
    }

    function healthEndpoint(req, res, arg2, arg3) {
        self.healthEndpoint(req, res, arg2, arg3);
    }

    function streamingEchoEndpoint(req, buildResponse) {
        self.streamingEchoEndpoint(req, buildResponse);
    }
}

TimeSeriesRemote.prototype.echoEndpoint =
function echoEndpoint(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendOk(arg2, arg3);
};

TimeSeriesRemote.prototype.streamingEchoEndpoint =
function streamingEchoEndpoint(req, buildResponse) {
    var resp = buildResponse({
        streamed: true
    });

    resp.headers.as = 'raw';
    resp.sendStreams(req.arg2, req.arg3);
};

TimeSeriesRemote.prototype.healthEndpoint = function healthEndpoint(req, res) {
    var self = this;

    res.headers.as = 'raw';
    res.sendOk('', 'served by ' + self.name);
};

TimeSeriesRemote.prototype.slowEndpoint = function slowEndpoint(req, res) {
    var self = this;

    var delay = self.fuzzedDelay(self.timers.now());
    // console.log('delay?', delay);
    setTimeout(respond, delay);

    function respond() {
        res.headers.as = 'raw';
        res.sendOk('', 'served by ' + self.name);
    }
};

// time +- 25%
TimeSeriesRemote.prototype.fuzzedDelay = function fuzzedDelay(time) {
    var rand = Math.floor((Math.random() - 0.5) * (time / 2));

    return time + rand;
};

function TimeWindow(options) {
    if (!(this instanceof TimeWindow)) {
        return new TimeWindow(options);
    }

    var self = this;

    self.start = options.start;
    self.buckets = options.buckets;
    self.interval = options.interval;

    self.index = 0;
    self.currentTime = self.buckets[self.index];

    self.boundAdvance = boundAdvance;

    function boundAdvance() {
        self.advance();
    }
}

TimeWindow.prototype.setTimer = function setTimer() {
    var self = this;

    setTimeout(self.boundAdvance, self.interval);
};

TimeWindow.prototype.advance = function advance() {
    var self = this;

    self.index++;

    self.currentTime = self.buckets[self.index];

    if (self.index < self.buckets.length) {
        self.setTimer();
    }
};

TimeWindow.prototype.now = function now() {
    var self = this;

    return self.currentTime;
};
