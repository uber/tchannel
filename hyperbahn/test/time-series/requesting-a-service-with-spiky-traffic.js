'use strict';

var setTimeout = require('timers').setTimeout;
var parallel = require('run-parallel');

var allocCluster = require('../lib/test-cluster.js');

var INSTANCES_SERVER = 10;
var INSTANCES_CLIENT = 5;
var RING_SIZE = 10;
var RING_K_VALUE = 4;

var CLIENT_REQUEST_BATCH_SIZE = 15;
var CLIENT_BATCH_DELAY = 100;
var CLIENT_BUCKET_SIZE = 5;

var SERVER_SERVICE_NAME = 'mary';
var CLIENT_SERVICE_NAME = 'mary-client';
var SERVER_ENDPOINT_NAME = 'slow-endpoint';

var NAMED_REMOTES = [];

for (var sIndex = 0; sIndex < INSTANCES_SERVER; sIndex++) {
    NAMED_REMOTES.push(SERVER_SERVICE_NAME);
}
for (var cIndex = 0; cIndex < INSTANCES_CLIENT; cIndex++) {
    NAMED_REMOTES.push(CLIENT_SERVICE_NAME);
}

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

*/

/*
    TODO; tests again with circuits on
    TODO; tests again with rate limiter on
    TODO; tests again with circuits + rate limiter on
*/

allocCluster.test('control test for time-series of timeout requests', {
    size: RING_SIZE,
    remoteConfig: {
        'rateLimiting.enabled': false,
        'kValue.default': RING_K_VALUE
    },
    namedRemotes: NAMED_REMOTES,
    seedConfig: {
        'hyperbahn.circuits': {
            period: 100,
            maxErrorRate: 0.5,
            minRequests: 5,
            probation: 5,
            enabled: false
        }
    }
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'error for timed out outgoing response');
    cluster.logger.whitelist('info', 'forwarding expected error frame');
    cluster.logger.whitelist('info', 'expected error while forwarding');
    cluster.logger.whitelist('info', 'OutResponse.send() after inreq timed out');
    cluster.logger.whitelist('warn', 'forwarding error frame');

    var RANGES = {
        '300': [0, 18],
        '425': [2, 40],
        '450': [5, 50],
        '500': [25, 80],
        '600': [50, 99]
    };

    /*
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

    var CLIENT_TIMEOUT = 500;
    var BUCKETS = [
        300, 500, 600, 500, 425, 300, 425, 450
    ];
    var MIN_ERRORS = [];
    var MAX_ERRORS = [];

    for (var k = 0; k < BUCKETS.length; k++) {
        var val = BUCKETS[k];
        MIN_ERRORS[k] = RANGES[val][0];
        MAX_ERRORS[k] = RANGES[val][1];
    }

    var timeWindow = TimeWindow({
        start: Date.now(),
        // for 3 seconds, every 0.5 change timeout rate.
        buckets: BUCKETS,
        interval: CLIENT_BATCH_DELAY * CLIENT_BUCKET_SIZE
    });

    var serverRemotes = cluster.namedRemotes.slice(0, INSTANCES_SERVER);

    for (var j = 0; j < serverRemotes.length; j++) {
        SlowRemote(serverRemotes[j], timeWindow, 'remote ' + j);
    }

    var clientRemotes = cluster.namedRemotes.slice(
        INSTANCES_SERVER, INSTANCES_SERVER + INSTANCES_CLIENT
    );

    var requestVolume = BUCKETS.length * (
        CLIENT_BUCKET_SIZE * CLIENT_REQUEST_BATCH_SIZE
    );
    var batchClient = BatchClient({
        remotes: clientRemotes,
        batchSize: CLIENT_REQUEST_BATCH_SIZE,
        clientBatchDelay: CLIENT_BATCH_DELAY,
        clientTimeout: CLIENT_TIMEOUT,
        requestVolume: requestVolume,
        bucketSize: CLIENT_BUCKET_SIZE,
        endpoint: SERVER_ENDPOINT_NAME
    });

    timeWindow.setTimer();
    batchClient.sendRequests(Date.now(), onResults);

    function onResults(err, results) {
        assert.ifError(err);

        for (var i = 0; i < BUCKETS.length; i++) {
            assertRange(assert, {
                value: results[i].errorCount,
                min: MIN_ERRORS[i],
                max: MAX_ERRORS[i],
                name: BUCKETS[i]
            });
        }

        assert.end();
    }
});

function assertRange(assert, options) {
    assert.ok(options.value >= options.min,
        'count (' + options.value + ') for ' +
        'reqs with timeout of ' + options.name +
        ' should have >= ' + options.min + ' errors');
    assert.ok(options.value <= options.max,
        'count (' + options.value + ') for ' +
        'reqs with timeout of ' + options.name +
        ' should have <= ' + options.max + ' errors');
}

function BatchClient(options) {
    if (!(this instanceof BatchClient)) {
        return new BatchClient(options);
    }

    var self = this;

    self.batchSize = options.batchSize;
    self.clientBatchDelay = options.clientBatchDelay;
    self.requestVolume = options.requestVolume;

    self.bucketSize = options.bucketSize;

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
        for (var i = 0; i < self.batchSize; i++) {
            requestCounter++;
            thunks.push(self._sendRequest.bind(self));
        }

        var batchResult = resultBuckets[bucketIndex];
        if (!batchResult) {
            batchResult = resultBuckets[bucketIndex] =
                new BatchClientResult();
        }

        currentBatch += 1;
        if (currentBatch % self.bucketSize === 0) {
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
        serviceName: SERVER_SERVICE_NAME,
        timeout: self.clientTimeout,
        headers: {
            'as': 'raw',
            'cn': CLIENT_SERVICE_NAME
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

function SlowRemote(remote, timers, name) {
    if (!(this instanceof SlowRemote)) {
        return new SlowRemote(remote, timers, name);
    }

    var self = this;

    self.timers = timers;
    self.channel = remote.serverChannel;
    self.name = name;

    self.channel.register(SERVER_ENDPOINT_NAME, slowEndpoint);

    function slowEndpoint(req, res) {
        self.slowEndpoint(req, res);
    }
}

SlowRemote.prototype.slowEndpoint = function slowEndpoint(req, res) {
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
SlowRemote.prototype.fuzzedDelay = function fuzzedDelay(time) {
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
