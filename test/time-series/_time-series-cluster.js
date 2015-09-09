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

var HyperbahnCluster = require('../lib/test-cluster.js');

TimeSeriesCluster.test = tapeCluster(tape, TimeSeriesCluster);

module.exports = TimeSeriesCluster;

function TimeSeriesCluster(opts) {
    /* eslint max-statements: [2, 40] */
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
    self.serverInstances = opts.serverInstances || 10;
    self.clientInstances = opts.clientInstances || 5;

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

    self.clusterOptions = opts.cluster || {};
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
    self.clusterOptions.namedRemotes = self.namedRemotes;
    if (!('hyperbahn.circuits' in self.clusterOptions.remoteConfig)) {
        self.clusterOptions.remoteConfig['hyperbahn.circuits'] = {
            period: 100,
            maxErrorRate: 0.5,
            minRequests: 5,
            probation: 5,
            enabled: false
        };
    }
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

        var requestVolume = self.buckets.length * (
            self.numBatchesInBucket * self.clientRequestsPerBatch
        );

        self.batchClient = BatchClient({
            remotes: clientRemotes,
            requestsPerBatch: self.clientRequestsPerBatch,
            clientBatchDelay: self.clientBatchDelay,
            clientTimeout: self.clientTimeout,
            requestVolume: requestVolume,
            numBatchesInBucket: self.numBatchesInBucket,
            endpoint: self.endpointToRequest,
            clientServiceName: self.clientServiceName,
            serverServiceName: self.serverServiceName
        });

        cb(null);
    }
};

TimeSeriesCluster.prototype.sendRequests = function sendRequests(cb) {
    var self = this;

    self.timeWindow.setTimer();
    self.batchClient.sendRequests(Date.now(), cb);
};

TimeSeriesCluster.prototype.close = function close(cb) {
    var self = this;

    self._cluster.close(cb);
};

TimeSeriesCluster.prototype.assertRange = function assertRange(assert, options) {
    assert.ok(options.value >= options.min,
        'count (' + options.value + ') for ' +
        'reqs with timeout of ' + options.name +
        ' should have >= ' + options.min + ' errors');
    assert.ok(options.value <= options.max,
        'count (' + options.value + ') for ' +
        'reqs with timeout of ' + options.name +
        ' should have <= ' + options.max + ' errors');
};

function BatchClient(options) {
    if (!(this instanceof BatchClient)) {
        return new BatchClient(options);
    }

    var self = this;

    self.serverServiceName = options.serverServiceName;
    self.clientServiceName = options.clientServiceName;
    self.requestsPerBatch = options.requestsPerBatch;
    self.clientBatchDelay = options.clientBatchDelay;
    self.requestVolume = options.requestVolume;

    self.numBatchesInBucket = options.numBatchesInBucket;

    self.clientTimeout = options.clientTimeout;
    self.endpoint = options.endpoint;

    self.timeWindow = options.timeWindow;
    self.channels = [];
    for (var i = 0; i < options.remotes.length; i++) {
        self.channels.push(options.remotes[i].clientChannel);
    }
}

BatchClient.prototype.sendRequests = function sendRequests(now, cb) {
    var self = this;

    var resultBuckets = [];
    var bucketIndex = 0;
    var currentBatch = 0;
    var requestCounter = 0;
    var responseCounter = 0;
    var startTime = now;

    loop();

    function loop() {
        if (requestCounter >= self.requestVolume) {
            return null;
        }

        var thunks = [];
        for (var i = 0; i < self.requestsPerBatch; i++) {
            requestCounter++;
            thunks.push(self._sendRequest.bind(self));
        }

        var batchResult = resultBuckets[bucketIndex];
        if (!batchResult) {
            batchResult = resultBuckets[bucketIndex] =
                new BatchClientResult();
        }

        currentBatch += 1;
        if (currentBatch % self.numBatchesInBucket === 0) {
            bucketIndex++;
        }

        parallel(thunks, onResults);

        var targetTime = startTime + (currentBatch * self.clientBatchDelay);
        var delta = targetTime - Date.now();

        setTimeout(loop, delta);

        function onResults(err, responses) {
            if (err) {
                return cb(err);
            }

            for (var j = 0; j < responses.length; j++) {
                responseCounter++;
                batchResult.push(responses[j]);
            }

            if (responseCounter >= self.requestVolume) {
                cb(null, resultBuckets);
            }
        }
    }
};

BatchClient.prototype._sendRequest = function _sendRequest(cb) {
    var self = this;

    var randomClient = self.channels[
        Math.floor(Math.random() * self.channels.length)
    ];

    var req = randomClient.request({
        serviceName: self.serverServiceName,
        timeout: self.clientTimeout,
        headers: {
            'as': 'raw',
            'cn': self.clientServiceName
        }
    });
    req.send(self.endpoint, '', '', onResponse);

    function onResponse(err, resp) {
        // console.log('got response', {
        //     err: !!err
        // });
        cb(null, {
            error: err || null,
            value: resp
        });
    }
};

function BatchClientResult() {
    if (!(this instanceof BatchClientResult)) {
        return new BatchClientResult();
    }

    var self = this;

    self._results = [];

    self.totalCount = 0;
    self.errorCount = 0;
    self.successCount = 0;
    self.timeoutCount = 0;
    self.declinedCount = 0;

    self.byType = {};
}

BatchClientResult.prototype.push = function push(result) {
    var self = this;

    self._results.push(result);

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

BatchClientResult.prototype.inspect = function inspect() {
    var self = this;

    return require('util').inspect({
        totalCount: self.totalCount,
        errorCount: self.errorCount,
        successCount: self.successCount,
        timeoutCount: self.timeoutCount,
        declinedCount: self.declinedCount,
        byType: self.byType
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

    function slowEndpoint(req, res) {
        self.slowEndpoint(req, res);
    }
}

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
}

TimeWindow.prototype.setTimer = function setTimer() {
    var self = this;

    setTimeout(function advance() {
        self.advance();
    }, self.interval);
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
