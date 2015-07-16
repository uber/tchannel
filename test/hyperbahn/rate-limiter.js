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
var DebugLogtron = require('debug-logtron');
var TChannelJSON = require('../../as/json');
var HyperbahnClient = require('../../hyperbahn/index.js');
var series = require('run-series');

module.exports = runTests;

if (require.main === module) {
    runTests(require('../lib/hyperbahn-cluster.js'));
}

function send(opts, done) {
    var tchannelJSON = TChannelJSON({
        logger: opts.logger
    });
    tchannelJSON.send(opts.bob.clientChannel.request({
        timeout: 5000,
        serviceName: opts.steve.serviceName
    }), 'echo', null, 'hello', function onResponse(err, res) {
        if (err) {
            opts.assert.end(err);
        }

        done(err, res);
    });
}

function wait(done) {
    setTimeout(done, 500);
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('rps counter works', {
        size: 1,
        seedConfig: {
            'rateLimiting': {
                'enabled': true,
                'rateLimiterBuckets': 2,
                'exemptServices': [
                    'hyperbahn',
                    'ringpop'
                ]
            }
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();
        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                send.bind(null, opts),
                function check(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        assert.equals(relayChannel.handler.rateLimiter.totalRequestCounter.rps, 6, 'total request');
                        assert.equals(relayChannel.handler.rateLimiter.counters.steve.rps, 3, 'request for steve');
                        assert.equals(relayChannel.handler.rateLimiter.counters.tcollector.rps, 3, 'request for tcollector');
                    });
                    done();
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('rps counter works in 1.5 seconds', {
        size: 1,
        seedConfig: {
            'rateLimiting': {
                'enabled': true,
                'rateLimiterBuckets': 2,
                'exemptServices': [
                    'hyperbahn',
                    'ringpop'
                ]
            }
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                wait,
                send.bind(null, opts),
                function check1(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        var rateLimiter = relayChannel.handler.rateLimiter;
                        assert.equals(rateLimiter.totalRequestCounter.rps, 6, 'check1: total request');
                        assert.equals(rateLimiter.counters.steve.rps, 3, 'check1: request for steve');
                        assert.equals(rateLimiter.counters.tcollector.rps, 3, 'check1: request for tcollector');
                    });
                    done();
                },
                wait,
                send.bind(null, opts),
                function check2(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        var rateLimiter = relayChannel.handler.rateLimiter;
                        assert.equals(rateLimiter.totalRequestCounter.rps, 4, 'check2: total request');
                        assert.equals(rateLimiter.counters.steve.rps, 2, 'check2: request for steve');
                        assert.equals(rateLimiter.counters.tcollector.rps, 2, 'check2: request for tcollector');
                    });
                    done();
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('service rate limiting works', {
        size: 1,
        kValue: 2,
        seedConfig: {
            'rateLimiting': {
                'enabled': true,
                'rateLimiterBuckets': 2,
                'exemptServices': [
                    'hyperbahn',
                    'ringpop'
                ],
                'rpsLimitForServiceName': {
                    'steve': 2
                }
            }
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                function sendError(done) {
                    var tchannelJSON = TChannelJSON({
                        logger: cluster.logger
                    });
                    tchannelJSON.send(bob.clientChannel.request({
                        timeout: 5000,
                        serviceName: steve.serviceName
                    }), 'echo', null, 'hello', function onResponse(err, res) {
                        assert.ok(err && err.type === 'tchannel.busy' &&
                            err.message === 'steve is rate-limited by the rps of 2',
                            'should be rate limited');
                        done();
                    });
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('total rate limiting works', {
        size: 5,
        kValue: 1,
        seedConfig: {
            'rateLimiting': {
                'enabled': true,
                'rateLimiterBuckets': 2,
                'totalRpsLimit': 2,
                'exemptServices': [
                    'hyperbahn',
                    'ringpop',
                    'tcollector'
                ]
            }
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                wait,
                function sendError(done) {
                    var tchannelJSON = TChannelJSON({
                        logger: cluster.logger
                    });
                    tchannelJSON.send(bob.clientChannel.request({
                        timeout: 5000,
                        serviceName: steve.serviceName
                    }), 'echo', null, 'hello', function onResponse(err, res) {
                        assert.ok(err && err.type === 'tchannel.busy' &&
                            err.message === 'hyperbahn node is rate-limited by the total rps of 2',
                            'should be rate limited');
                        done();
                    });
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });
}
