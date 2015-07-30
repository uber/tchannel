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
var test = require('tape');
var TimeMock = require('time-mock');
var timers = TimeMock(Date.now());
var series = require('run-series');
var RateLimiter = require('../rate_limiter.js');

var nullStatsd = require('uber-statsd-client/null');
var StatEmitter = require('../lib/stat_emitter');
var TChannelStatsd = require('../lib/statsd');

function increment(rateLimiter, steve, bob, done) {
    if (steve) {
        rateLimiter.incrementTotalCounter('steve');
        rateLimiter.incrementServiceCounter('steve');
    }

    if (bob) {
        rateLimiter.incrementTotalCounter('bob');
        rateLimiter.incrementServiceCounter('bob');
    }

    if (done) {
        done();
    }
}

function wait(done) {
    timers.setTimeout(done, 500);
    timers.advance(500);
}

test('rps counter works', function (assert) {
    var statEmitter = new StatEmitter();
    var statsd = new TChannelStatsd({
        statEmitter: statEmitter,
        statsd: nullStatsd(2)
    });

    var rateLimiter = RateLimiter ({
        timers: timers,
        numOfBuckets: 2,
        statEmitter: statEmitter
    });

    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve');

    assert.equals(rateLimiter.totalRequestCounter.rps, 5, 'total request');
    assert.equals(rateLimiter.counters.steve.rps, 3, 'request for steve');
    assert.equals(rateLimiter.counters.bob.rps, 2, 'request for bob');

    assert.deepEqual(statsd.statsd._buffer._elements, [{
        type: 'g',
        name: 'tchannel.rate-limiting.total-rps',
        value: null,
        delta: null,
        time: null
    }, {
        type: 'g',
        name: 'tchannel.rate-limiting.total-rps-limit',
        value: 1000,
        delta: null,
        time: null
    }], 'stats keys/values as expected');

    rateLimiter.destroy();
    assert.end();
});

test('rps counter works in 1.5 seconds', function (assert) {
    var statEmitter = new StatEmitter();
    var statsd = new TChannelStatsd({
        statEmitter: statEmitter,
        statsd: nullStatsd(26)
    });

    var rateLimiter = RateLimiter ({
        timers: timers,
        numOfBuckets: 2,
        statEmitter: statEmitter
    });

    series([
        increment.bind(null, rateLimiter, 'steve', 'bob'),
        increment.bind(null, rateLimiter, 'steve', 'bob'),
        wait,
        increment.bind(null, rateLimiter, 'steve', null),
        function check1(done) {
            assert.equals(rateLimiter.totalRequestCounter.rps, 5, 'check1: total request');
            assert.equals(rateLimiter.counters.steve.rps, 3, 'check1: request for steve');
            assert.equals(rateLimiter.counters.bob.rps, 2, 'check1: request for bob');
            done();
        },
        wait,
        increment.bind(null, rateLimiter, 'steve', 'bob'),
        function check2(done) {
            assert.equals(rateLimiter.totalRequestCounter.rps, 3, 'check2: total request');
            assert.equals(rateLimiter.counters.steve.rps, 2, 'check2: request for steve');
            assert.equals(rateLimiter.counters.bob.rps, 1, 'check2: request for bob');
            done();
        }
    ], function done() {
        if (!rateLimiter.destroyed) {
            assert.deepEqual(statsd.statsd._buffer._elements, [{
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps',
                value: null,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps-limit',
                value: 1000,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps',
                value: 4,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps-limit',
                value: 1000,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.steve',
                value: 2,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.steve',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.bob',
                value: 2,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.bob',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps',
                value: 5,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps-limit',
                value: 1000,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.steve',
                value: 3,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.steve',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.bob',
                value: 2,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.bob',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps',
                value: 3,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps-limit',
                value: 1000,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.steve',
                value: 2,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.steve',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.bob',
                value: 1,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.bob',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps',
                value: 2,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.total-rps-limit',
                value: 1000,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.steve',
                value: 1,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.steve',
                value: 100,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps.bob',
                value: 1,
                delta: null,
                time: null
            }, {
                type: 'g',
                name: 'tchannel.rate-limiting.service-rps-limit.bob',
                value: 100,
                delta: null,
                time: null
            }], 'stats keys/values as expected');

            rateLimiter.destroy();
            assert.end();
        }
    });
});

test('remove counter works', function (assert) {
    var rateLimiter = RateLimiter ({
        timers: timers,
        numOfBuckets: 2
    });

    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve');

    rateLimiter.removeServiceCounter('steve');

    assert.equals(rateLimiter.totalRequestCounter.rps, 5, 'total request');
    assert.ok(!rateLimiter.counters.steve, 'steve should be removed');
    assert.equals(rateLimiter.counters.bob.rps, 2, 'request for bob');

    rateLimiter.destroy();
    assert.end();
});

test('rate limit works', function (assert) {
    var rateLimiter = RateLimiter ({
        timers: timers,
        numOfBuckets: 2,
        rpsLimitForServiceName: {
            steve: 2
        },
        totalRpsLimit: 3
    });

    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve');

    assert.equals(rateLimiter.totalRequestCounter.rps, 5, 'total request');
    assert.equals(rateLimiter.counters.steve.rps, 3, 'request for steve');
    assert.equals(rateLimiter.counters.bob.rps, 2, 'request for bob');

    assert.ok(rateLimiter.shouldRateLimitTotalRequest(), 'should rate limit total request');
    assert.ok(rateLimiter.shouldRateLimitService('steve'), 'should rate limit steve');
    assert.ok(!rateLimiter.shouldRateLimitService('bob'), 'should not rate limit bob');

    rateLimiter.destroy();
    assert.end();
});

test('rate exempt service works', function (assert) {
    var rateLimiter = RateLimiter ({
        timers: timers,
        totalRpsLimit: 2,
        exemptServices: ['steve']
    });

    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');

    assert.ok(!rateLimiter.shouldRateLimitTotalRequest('steve'), 'should not rate limit steve');
    assert.ok(!rateLimiter.shouldRateLimitService('steve'), 'should not rate limit steve');
    assert.ok(rateLimiter.shouldRateLimitTotalRequest('bob'), 'should rate limit bob');

    rateLimiter.destroy();
    assert.end();
});

test('rate exempt service works', function (assert) {
    var rateLimiter = RateLimiter ({
        timers: timers,
        totalRpsLimit: 2,
        rpsLimitForServiceName: {
            steve: 2,
            bob: 2
        },
    });

    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');
    increment(rateLimiter, 'steve', 'bob');

    assert.ok(rateLimiter.shouldRateLimitTotalRequest(), 'should rate limit total');
    assert.ok(rateLimiter.shouldRateLimitService('steve'), 'should rate limit steve');
    assert.ok(rateLimiter.shouldRateLimitService('bob'), 'should rate limit bob');

    rateLimiter.updateTotalLimit(10);
    rateLimiter.updateServiceLimit('steve', 10);

    assert.ok(!rateLimiter.shouldRateLimitTotalRequest(), 'should not rate limit total');
    assert.ok(!rateLimiter.shouldRateLimitService('steve'), 'should not rate limit steve');
    assert.ok(rateLimiter.shouldRateLimitService('bob'), 'should rate limit bob');

    rateLimiter.destroy();
    assert.end();
});
